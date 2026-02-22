import { HttpResponse } from '@spraxdev/node-commons/http';
import MinecraftApi from '../src/MinecraftApi';

const validUser = { name: 'SpraxDev', id: '955e4cf6-411c-40d1-a176-5bc8e03a8a9a' };
const invalidUser = { name: 'SuperAdmin', id: '00000000-0000-0000-0000-000000000000' };

describe('Request Minecraft profiles with default endpoints', () => {
  const doApiRequestMock = jest.fn();
  const apiClient = new MinecraftApi('Test-Agent');
  (apiClient as any).doApiRequest = doApiRequestMock;

  test('Request profile by username (existing)', async () => {
    doApiRequestMock.mockResolvedValueOnce(new HttpResponse(200, new Map(), Buffer.from(JSON.stringify(validUser))));

    await expect(apiClient.getProfile(validUser.name))
      .resolves
      .toEqual(validUser);

    expect(doApiRequestMock).toHaveBeenCalledTimes(1);
    expect(doApiRequestMock.mock.calls[0][1]).toBe(validUser.name);
  });

  test('Request profile by username (non existing)', async () => {
    doApiRequestMock.mockResolvedValueOnce(new HttpResponse(404, new Map(), Buffer.from(JSON.stringify({ error: 'Not found' }))));

    await expect(apiClient.getProfile(invalidUser.name))
      .resolves
      .toEqual(null);

    expect(doApiRequestMock).toHaveBeenCalledTimes(1);
    expect(doApiRequestMock.mock.calls[0][1]).toBe(invalidUser.name);
  });

  test('Request profile by UUID (existing)', async () => {
    doApiRequestMock.mockResolvedValueOnce(new HttpResponse(200, new Map(), Buffer.from(JSON.stringify(validUser))));

    await expect(apiClient.getProfile(validUser.id))
      .resolves
      .toEqual(validUser);

    expect(doApiRequestMock).toHaveBeenCalledTimes(1);
    expect(doApiRequestMock.mock.calls[0][1]).toBe(validUser.id.replaceAll('-', ''));
  });

  test('Request profile by UUID (non existing)', async () => {
    doApiRequestMock.mockResolvedValueOnce(new HttpResponse(204, new Map(), Buffer.from(JSON.stringify({ error: 'Not found' }))));

    await expect(apiClient.getProfile(invalidUser.id))
      .resolves
      .toEqual(null);

    expect(doApiRequestMock).toHaveBeenCalledTimes(1);
    expect(doApiRequestMock.mock.calls[0][1]).toBe(invalidUser.id.replaceAll('-', ''));
  });

  test('Request profile by Username, first API errors', async () => {
    doApiRequestMock
      .mockResolvedValue(new HttpResponse(200, new Map(), Buffer.from(JSON.stringify(validUser))))
      .mockRejectedValueOnce(new Error('Test error'));

    await expect(apiClient.getProfile(validUser.name))
      .resolves
      .toEqual(validUser);

    expect(doApiRequestMock).toHaveBeenCalledTimes(3);

    expect(doApiRequestMock.mock.calls[0][1]).toBe(validUser.name);
    expect(doApiRequestMock.mock.calls[1][1]).toBe(validUser.name);
    expect(doApiRequestMock.mock.calls[2][1]).toBe(validUser.id.replaceAll('-', ''));
  });

  test('Request profile by UUID, all APIs error', async () => {
    doApiRequestMock.mockRejectedValue(new Error('Test error'));

    const expectedId = validUser.id.replaceAll('-', '');

    try {
      await apiClient.getProfile(validUser.id);
      fail('Expected error');
    } catch (err: any) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message.startsWith(`Failed to fetch profile for '${expectedId}': Error fetching profile from `))
        .toBeTruthy();
    }

    expect(doApiRequestMock).toHaveBeenCalledTimes(2);

    expect(doApiRequestMock.mock.calls[0][1]).toBe(expectedId);
    expect(doApiRequestMock.mock.calls[1][1]).toBe(expectedId);
  });
});

describe('Request Minecraft profiles with official endpoints only', () => {
  const doApiRequestMock = jest.fn();
  const apiClient = new MinecraftApi('Test-Agent', MinecraftApi.OFFICIAL_ENDPOINTS_ONLY);
  (apiClient as any).doApiRequest = doApiRequestMock;

  test('Request profile by username (existing)', async () => {
    doApiRequestMock.mockResolvedValue(new HttpResponse(200, new Map(), Buffer.from(JSON.stringify(validUser))));

    await expect(apiClient.getProfile(validUser.name))
      .resolves
      .toEqual(validUser);

    expect(doApiRequestMock).toHaveBeenCalledTimes(2);
    expect(doApiRequestMock.mock.calls[0][1]).toBe(validUser.name);
    expect(doApiRequestMock.mock.calls[1][1]).toBe(validUser.id.replaceAll('-', ''));
  });

  test('Request profile by username (non existing)', async () => {
    doApiRequestMock.mockResolvedValue(new HttpResponse(204, new Map(), Buffer.from(JSON.stringify(validUser))));

    await expect(apiClient.getProfile(invalidUser.name))
      .resolves
      .toEqual(null);

    expect(doApiRequestMock).toHaveBeenCalledTimes(1);
    expect(doApiRequestMock.mock.calls[0][1]).toBe(invalidUser.name);
  });
});

describe('Request Minecraft UUIDs with official endpoints only', () => {
  const doApiRequestMock = jest.fn();
  const apiClient = new MinecraftApi('Test-Agent', MinecraftApi.OFFICIAL_ENDPOINTS_ONLY);
  (apiClient as any).doApiRequest = doApiRequestMock;

  test('Request UUID by username, but endpoint errors', async () => {
    doApiRequestMock.mockRejectedValue(new Error('Test error'));

    try {
      await apiClient.getUuid(validUser.name);
      fail('Expected error');
    } catch (err: any) {
      expect(err).toBeInstanceOf(Error);
      console.log(err.message);
      expect(err.message.startsWith('No further endpoints available (')).toBeTruthy();
      expect(err.message.includes('Test error')).toBeTruthy();
    }

    expect(doApiRequestMock).toHaveBeenCalledTimes(1);
    expect(doApiRequestMock.mock.calls[0][1]).toBe(validUser.name);
  });
});

test('Request profile without any endpoints', async () => {
  const apiClient = new MinecraftApi('Test-Agent', { profile: [], usernameToUuid: [] });

  await expect(apiClient.getProfile(validUser.id))
    .rejects
    .toThrow(`No endpoint available for type 'profile' (shouldAcceptUsernames=false)`);
});

describe('Endpoint timeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('Endpoint available after timeout', async () => {
    const doApiRequestMock = jest.fn().mockRejectedValue(new Error('Test error'));
    const apiClient = new MinecraftApi('Test-Agent');
    (apiClient as any).doApiRequest = doApiRequestMock;

    await expect(apiClient.getProfile(validUser.id))
      .rejects
      .toBeInstanceOf(Error);
    expect(doApiRequestMock).toHaveBeenCalledTimes(3);

    await expect(apiClient.getProfile(validUser.id))
      .rejects
      .toBeInstanceOf(Error);
    expect(doApiRequestMock).toHaveBeenCalledTimes(4);

    jest.advanceTimersByTime(5 * 60 * 1000); /* 5min */

    await expect(apiClient.getProfile(validUser.id))
      .rejects
      .toBeInstanceOf(Error);

    expect(doApiRequestMock).toHaveBeenCalledTimes(7);
  });
});
