import { StringUtils } from '@spraxdev/node-commons';
import { type HttpClient, type HttpResponse, UndiciHttpClient } from '@spraxdev/node-commons/http';

export interface ApiEndpoint {
  url: string;
  ignoreTimeoutWhenNoEndpointsLeft?: boolean;
  responseConverter?: (body: Buffer) => any;
}

export interface ProfileApiEndpoint extends ApiEndpoint {
  acceptsUsername?: boolean;
  responseConverter?: (body: Buffer) => MinecraftProfile;
}

export type ApiEndpoints = {
  profile: ProfileApiEndpoint[];
  usernameToUuid: ApiEndpoint[];
};

export interface MinecraftProfile extends MinecraftUuid {
  properties: { name: string; value: string; signature?: string; }[];
}

export interface MinecraftUuid {
  id: string;
  name: string;
  legacy?: boolean;
}

// TODO: If an endpoint fails on its first request after timeout, the timeout time should be bigger than the previous one (fibonacci sequence?)
// TODO: Add support for UUID -> Name History
// TODO: Add support for 'Blocked servers' api
// TODO: Currently, when all endpoints have been tried, the first one is tried again as it is a fallback, this should not happen (either no fallback, or detect it)
// TODO: If no UUID endpoint succeeded, try the profile ones if any supports requests by username (make sure urls are not requested twice!)

export default class MinecraftApi {
  static readonly DEFAULT_ENDPOINTS: ApiEndpoints = Object.freeze({
    profile: [
      { url: 'https://api.sprax.dev/mc/v1/profile/%s', acceptsUsername: true, ignoreTimeoutWhenNoEndpointsLeft: true },
      { url: 'https://sessionserver.mojang.com/session/minecraft/profile/%s?unsigned=false' },
    ],
    usernameToUuid: [
      { url: 'https://api.sprax.dev/mc/v1/uuid/%s', ignoreTimeoutWhenNoEndpointsLeft: true },
      { url: 'https://api.mojang.com/users/profiles/minecraft/%s' },
    ],
  });
  static readonly OFFICIAL_ENDPOINTS_ONLY: ApiEndpoints = Object.freeze({
    profile: [{ url: 'https://sessionserver.mojang.com/session/minecraft/profile/%s?unsigned=false' }],
    usernameToUuid: [{ url: 'https://api.mojang.com/users/profiles/minecraft/%s' }],
  });

  private static readonly defaultResponseConverter = (body: Buffer) => JSON.parse(body.toString('utf-8'));

  protected readonly httpClient: HttpClient;
  protected readonly apiEndpoints: ApiEndpoints;
  protected readonly endpointsInTimeout: { [key: string]: number } = {};

  constructor(userAgent: string, apiEndPoints: ApiEndpoints = MinecraftApi.DEFAULT_ENDPOINTS) {
    this.httpClient = new UndiciHttpClient(userAgent);

    this.apiEndpoints = apiEndPoints;
  }

  public async getProfile(usernameOrUuid: string): Promise<MinecraftProfile | null> {
    const endpointType: keyof ApiEndpoints = 'profile';
    const isUuid = usernameOrUuid.length > 16;

    if (isUuid) {
      usernameOrUuid = usernameOrUuid.replaceAll('-', '');
    }

    const errorsWhenDirectlyFetchingAProfile: string[] = [];
    let profile: MinecraftProfile | null | undefined = undefined;

    let currentEndpoint: ApiEndpoint | undefined = undefined;
    while (true) {
      const newEndpoint = this.getEndpoint(endpointType, !isUuid);  // TODO: `ignoreTimeoutWhenNoEndpointsLeft` beachten

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
          if (retryAfterHeader != null && StringUtils.default.isNumeric(retryAfterHeader)) {
            this.endpointsInTimeout[currentEndpoint.url] = Math.max(10_000, parseInt(retryAfterHeader, 10) * 1000);
          } else {
            this.endpointsInTimeout[currentEndpoint.url] = 10_000;
          }
        }
      } catch (err: any) {
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

  public async getUuid(username: string): Promise<MinecraftUuid | null> {
    const endpointType: keyof ApiEndpoints = 'usernameToUuid';

    let mcUuid: MinecraftUuid | null | undefined = undefined;

    const errorsWhenFetchingUuid: string[] = [];
    let currentEndpoint: ApiEndpoint | undefined = undefined;
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
        } else if (httpRes.statusCode == 404 || httpRes.statusCode == 204) {
          mcUuid = null;
          break;
        }
      } catch (err: any) {
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

  protected async doApiRequest(url: string, arg: string): Promise<HttpResponse> {
    return this.httpClient.get(url.replaceAll('%s', arg), { headers: { Accept: 'application/json' } });
  }

  protected getEndpoint(type: keyof ApiEndpoints, shouldAcceptUsernames: boolean = false): ApiEndpoint | null {
    if (this.apiEndpoints[type].length == 0) {
      throw new Error(`No endpoint available for type '${type}' (shouldAcceptUsernames=${shouldAcceptUsernames})`);
    }

    for (const apiEndpoint of this.apiEndpoints[type]) {
      if (this.isUrlInTimeout(apiEndpoint.url, type)) {
        continue;
      }

      if (!shouldAcceptUsernames || (apiEndpoint as ProfileApiEndpoint).acceptsUsername) {
        return apiEndpoint;
      }
    }

    const fallbackEndpoint = this.apiEndpoints[type][0];
    if (!shouldAcceptUsernames || ((fallbackEndpoint as ProfileApiEndpoint).acceptsUsername)) {
      return fallbackEndpoint;
    }

    return null;
  }

  protected isUrlInTimeout(url: string, type: keyof ApiEndpoints): boolean {
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
