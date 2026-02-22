"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_commons_1 = require("@spraxdev/node-commons");
const http_1 = require("@spraxdev/node-commons/http");
// TODO: If an endpoint fails on its first request after timeout, the timeout time should be bigger than the previous one (fibonacci sequence?)
// TODO: Add support for UUID -> Name History
// TODO: Add support for 'Blocked servers' api
// TODO: Currently, when all endpoints have been tried, the first one is tried again as it is a fallback, this should not happen (either no fallback, or detect it)
// TODO: If no UUID endpoint succeeded, try the profile ones if any supports requests by username (make sure urls are not requested twice!)
class MinecraftApi {
    static DEFAULT_ENDPOINTS = Object.freeze({
        profile: [
            { url: 'https://api.sprax.dev/mc/v1/profile/%s', acceptsUsername: true, ignoreTimeoutWhenNoEndpointsLeft: true },
            { url: 'https://sessionserver.mojang.com/session/minecraft/profile/%s?unsigned=false' },
        ],
        usernameToUuid: [
            { url: 'https://api.sprax.dev/mc/v1/uuid/%s', ignoreTimeoutWhenNoEndpointsLeft: true },
            { url: 'https://api.mojang.com/users/profiles/minecraft/%s' },
        ],
    });
    static OFFICIAL_ENDPOINTS_ONLY = Object.freeze({
        profile: [{ url: 'https://sessionserver.mojang.com/session/minecraft/profile/%s?unsigned=false' }],
        usernameToUuid: [{ url: 'https://api.mojang.com/users/profiles/minecraft/%s' }],
    });
    static defaultResponseConverter = (body) => JSON.parse(body.toString('utf-8'));
    httpClient;
    apiEndpoints;
    endpointsInTimeout = {};
    constructor(userAgent, apiEndPoints = MinecraftApi.DEFAULT_ENDPOINTS) {
        this.httpClient = new http_1.UndiciHttpClient(userAgent);
        this.apiEndpoints = apiEndPoints;
    }
    async getProfile(usernameOrUuid) {
        const endpointType = 'profile';
        const isUuid = usernameOrUuid.length > 16;
        if (isUuid) {
            usernameOrUuid = usernameOrUuid.replaceAll('-', '');
        }
        const errorsWhenDirectlyFetchingAProfile = [];
        let profile = undefined;
        let currentEndpoint = undefined;
        while (true) {
            const newEndpoint = this.getEndpoint(endpointType, !isUuid); // TODO: `ignoreTimeoutWhenNoEndpointsLeft` beachten
            if (newEndpoint == null) {
                break;
            }
            if (currentEndpoint == newEndpoint) {
                errorsWhenDirectlyFetchingAProfile.push(`No further endpoints available`);
                break;
            }
            currentEndpoint = newEndpoint;
            try {
                const httpRes = await this.doApiRequest(currentEndpoint.url, usernameOrUuid);
                if (httpRes.statusCode == 200) {
                    profile = (currentEndpoint.responseConverter ?? MinecraftApi.defaultResponseConverter)(httpRes.body);
                    break;
                }
                if (httpRes.statusCode == 404 || httpRes.statusCode == 204) {
                    profile = null;
                    break;
                }
                if (httpRes.statusCode == 429) {
                    const retryAfterHeader = httpRes.getHeader('retry-after');
                    if (retryAfterHeader != null && node_commons_1.StringUtils.default.isNumeric(retryAfterHeader)) {
                        this.endpointsInTimeout[currentEndpoint.url] = Math.max(10_000, parseInt(retryAfterHeader, 10) * 1000);
                    }
                    else {
                        this.endpointsInTimeout[currentEndpoint.url] = 10_000;
                    }
                }
            }
            catch (err) {
                errorsWhenDirectlyFetchingAProfile.push(`Error fetching profile from '${currentEndpoint.url}' (${err.message})`);
                // this.endpointsInTimeout[`${endpointType}_${currentEndpoint.url}`] = Date.now() + 1000; /* 1s */
            }
        }
        if (profile !== undefined) {
            return profile;
        }
        if (errorsWhenDirectlyFetchingAProfile.length > 0 && isUuid) {
            throw new Error(`Failed to fetch profile for '${usernameOrUuid}': ${errorsWhenDirectlyFetchingAProfile.join('; ')}`);
        }
        const profileId = await this.getUuid(usernameOrUuid);
        if (profileId == null) {
            return null;
        }
        return this.getProfile(profileId.id);
    }
    async getUuid(username) {
        const endpointType = 'usernameToUuid';
        let mcUuid = undefined;
        const errorsWhenFetchingUuid = [];
        let currentEndpoint = undefined;
        while (true) {
            const newEndpoint = this.getEndpoint(endpointType);
            if (newEndpoint == null || currentEndpoint == newEndpoint) {
                throw new Error(`No further endpoints available (${JSON.stringify(errorsWhenFetchingUuid)})`);
            }
            currentEndpoint = newEndpoint;
            try {
                const httpRes = await this.doApiRequest(currentEndpoint.url, username);
                if (httpRes.statusCode == 200) {
                    mcUuid = (currentEndpoint.responseConverter ?? MinecraftApi.defaultResponseConverter)(httpRes.body);
                    break;
                }
                else if (httpRes.statusCode == 404 || httpRes.statusCode == 204) {
                    mcUuid = null;
                    break;
                }
            }
            catch (err) {
                errorsWhenFetchingUuid.push(`Error fetching UUID from ${JSON.stringify({
                    url: currentEndpoint.url,
                    arg: username,
                })} (${err.message})`);
                this.endpointsInTimeout[`${endpointType}_${currentEndpoint.url}`] = Date.now() + 60 * 1000; /* 1min */
            }
        }
        if (mcUuid !== undefined) {
            return mcUuid;
        }
        if (errorsWhenFetchingUuid.length > 0) {
            throw new Error(`Failed to fetch UUID for '${username}': ${errorsWhenFetchingUuid.join('; ')}`);
        }
        throw new Error(`Failed to fetch UUID for '${username}'`); // TODO
    }
    async doApiRequest(url, arg) {
        return this.httpClient.get(url.replaceAll('%s', arg), { headers: { Accept: 'application/json' } });
    }
    getEndpoint(type, shouldAcceptUsernames = false) {
        if (this.apiEndpoints[type].length == 0) {
            throw new Error(`No endpoint available for type '${type}' (shouldAcceptUsernames=${shouldAcceptUsernames})`);
        }
        for (const apiEndpoint of this.apiEndpoints[type]) {
            if (this.isUrlInTimeout(apiEndpoint.url, type)) {
                continue;
            }
            if (!shouldAcceptUsernames || apiEndpoint.acceptsUsername) {
                return apiEndpoint;
            }
        }
        const fallbackEndpoint = this.apiEndpoints[type][0];
        if (!shouldAcceptUsernames || (fallbackEndpoint.acceptsUsername)) {
            return fallbackEndpoint;
        }
        return null;
    }
    isUrlInTimeout(url, type) {
        const key = `${type}_${url}`;
        if (this.endpointsInTimeout[key] == null) {
            return false;
        }
        const timeoutEnds = this.endpointsInTimeout[key];
        if (Date.now() > timeoutEnds) {
            delete this.endpointsInTimeout[key];
            return false;
        }
        return true;
    }
}
exports.default = MinecraftApi;
//# sourceMappingURL=MinecraftApi.js.map