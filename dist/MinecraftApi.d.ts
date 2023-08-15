/// <reference types="node" />
import HttpClient, { HttpResponse } from '@spraxdev/node-commons/dist/HttpClient';
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
    properties: {
        name: string;
        value: string;
        signature?: string;
    }[];
}
export interface MinecraftUuid {
    id: string;
    name: string;
    legacy?: boolean;
}
export default class MinecraftApi {
    static readonly DEFAULT_ENDPOINTS: ApiEndpoints;
    static readonly OFFICIAL_ENDPOINTS_ONLY: ApiEndpoints;
    private static readonly defaultResponseConverter;
    protected readonly httpClient: HttpClient;
    protected readonly apiEndpoints: ApiEndpoints;
    protected readonly endpointsInTimeout: {
        [key: string]: number;
    };
    constructor(userAgent: string, apiEndPoints?: ApiEndpoints);
    getProfile(usernameOrUuid: string): Promise<MinecraftProfile | null>;
    getUuid(username: string): Promise<MinecraftUuid | null>;
    protected doApiRequest(url: string, arg: string): Promise<HttpResponse>;
    protected getEndpoint(type: keyof ApiEndpoints, shouldAcceptUsernames?: boolean): ApiEndpoint | null;
    protected isUrlInTimeout(url: string, type: keyof ApiEndpoints): boolean;
}
//# sourceMappingURL=MinecraftApi.d.ts.map