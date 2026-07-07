import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { AuthController } from './auth.controller';

describe('AuthController throttling', () => {
  function buildGuard(storage: ThrottlerStorage) {
    // Mirrors app.module.ts's real ThrottlerModule.forRoot() config.
    const options: ThrottlerModuleOptions = {
      throttlers: [{ name: 'default', ttl: 60_000, limit: 20 }],
    };
    return new ThrottlerGuard(options, storage, new Reflector());
  }

  function httpContextFor(handler: (...args: never[]) => unknown) {
    return {
      getClass: () => AuthController,
      getHandler: () => handler,
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, ip: '127.0.0.1' }),
        getResponse: () => ({ header: jest.fn() }),
      }),
    } as unknown as ExecutionContext;
  }

  function buildStorage(): ThrottlerStorage & { increment: jest.Mock } {
    return {
      increment: jest.fn().mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    };
  }

  it('applies the tighter 5 req/min override on login and register', async () => {
    const storage = buildStorage();
    const guard = buildGuard(storage);
    await guard.onModuleInit();

    // These reference the class's methods only as metadata lookup keys for
    // context.getHandler() -- never invoked -- so unbound `this` is moot.
    /* eslint-disable @typescript-eslint/unbound-method */
    await guard.canActivate(httpContextFor(AuthController.prototype.login));
    await guard.canActivate(httpContextFor(AuthController.prototype.register));
    /* eslint-enable @typescript-eslint/unbound-method */

    expect(storage.increment).toHaveBeenCalledTimes(2);
    for (const call of storage.increment.mock.calls) {
      const [, ttl, limit] = call;
      expect(ttl).toBe(60_000);
      expect(limit).toBe(5);
    }
  });

  it('still enforces the app-wide default limit on other auth routes', async () => {
    const storage = buildStorage();
    const guard = buildGuard(storage);
    await guard.onModuleInit();

    // eslint-disable-next-line @typescript-eslint/unbound-method -- lookup key only, never invoked
    await guard.canActivate(httpContextFor(AuthController.prototype.me));

    const [, ttl, limit] = storage.increment.mock.calls[0];
    expect(ttl).toBe(60_000);
    expect(limit).toBe(20);
  });
});
