"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const HttpClient_1 = __importDefault(require("@spraxdev/node-commons/dist/HttpClient"));
// TODO: If an endpoint fails on its first request after timeout, the timeout time should be bigger than the previous one (fibonacci sequence?)
// TODO: Add support for UUID -> Name History
// TODO: Add support for 'Blocked servers' api
// TODO: Currently, when all endpoints have been tried, the first one is tried again as it is a fallback, this should not happen (either no fallback, or detect it)
// TODO: If no UUID endpoint succeeded, try the profile ones if any supports requests by username (make sure urls are not requested twice!)
class MinecraftApi {
    constructor(userAgent, apiEndPoints = MinecraftApi.DEFAULT_ENDPOINTS) {
        this.endpointsInTimeout = {};
        this.httpClient = new HttpClient_1.default(userAgent, {
            dontUseGlobalAgent: true,
            defaultHeaders: { Accept: 'application/json' }
        });
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
            const newEndpoint = this.getEndpoint(endpointType, !isUuid);
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
                if (httpRes.status == 200) {
                    profile = (currentEndpoint.responseConverter ?? MinecraftApi.defaultResponseConverter)(httpRes.body);
                    break;
                }
                else if (httpRes.status == 404 || httpRes.status == 204) {
                    profile = null;
                    break;
                }
            }
            catch (err) {
                errorsWhenDirectlyFetchingAProfile.push(`Error fetching profile from '${currentEndpoint.url}' (${err.message})`);
                this.endpointsInTimeout[`${endpointType}_${currentEndpoint.url}`] = Date.now() + 60 * 1000; /* 1min */
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
                throw new Error(`No further endpoints available (${errorsWhenFetchingUuid.join('; ')})`);
            }
            currentEndpoint = newEndpoint;
            try {
                const httpRes = await this.doApiRequest(currentEndpoint.url, username);
                if (httpRes.status == 200) {
                    mcUuid = (currentEndpoint.responseConverter ?? MinecraftApi.defaultResponseConverter)(httpRes.body);
                    break;
                }
                else if (httpRes.status == 404 || httpRes.status == 204) {
                    mcUuid = null;
                    break;
                }
            }
            catch (err) {
                errorsWhenFetchingUuid.push(`Error fetching UUID from '${currentEndpoint.url}' (${err.message})`);
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
        return this.httpClient.get(url.replaceAll('%s', arg));
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
MinecraftApi.DEFAULT_ENDPOINTS = Object.freeze({
    profile: [
        { url: 'https://api.sprax2013.de/mc/profile/%s', acceptsUsername: true },
        { url: 'https://sessionserver.mojang.com/session/minecraft/profile/%s?unsigned=false' }
    ],
    usernameToUuid: [
        { url: 'https://api.sprax2013.de/mc/uuid/%s' },
        { url: 'https://api.mojang.com/users/profiles/minecraft/%s' }
    ]
});
MinecraftApi.OFFICIAL_ENDPOINTS_ONLY = Object.freeze({
    profile: [{ url: 'https://sessionserver.mojang.com/session/minecraft/profile/%s?unsigned=false' }],
    usernameToUuid: [{ url: 'https://api.mojang.com/users/profiles/minecraft/%s' }]
});
MinecraftApi.defaultResponseConverter = (body) => JSON.parse(body.toString('utf-8'));
//# sourceMappingURL=MinecraftApi.js.map