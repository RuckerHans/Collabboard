import { ExecutionContext, CallHandler, UnauthorizedException } from '@nestjs/common';
import { of } from 'rxjs';
import { RlsTransactionInterceptor } from './rls-transaction.interceptor'; // <-- confirm this path
import { DatabaseService } from './database.service';

describe('RlsTransactionInterceptor', () => {
  let interceptor: RlsTransactionInterceptor;
  let mockDb: any;
  let mockReflector: any;

  beforeEach(() => {
    mockDb = {
      runInRlsTransaction: jest.fn((userId, work) => work()),
    };
    mockReflector = {
      getAllAndOverride: jest.fn(),
    };
    interceptor = new RlsTransactionInterceptor(mockDb, mockReflector);
  });

  function makeContext(request: any, type: string = 'http'): ExecutionContext {
    return {
      getType: () => type,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  function makeNext(returnValue: any = 'handler result'): CallHandler {
    return {
      handle: () => of(returnValue),
    } as CallHandler;
  }

  it('passes through immediately for non-HTTP contexts (e.g. WebSocket)', (done) => {
    const context = makeContext({}, 'ws');
    const next = makeNext('ws result');

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toBe('ws result');
      expect(mockDb.runInRlsTransaction).not.toHaveBeenCalled();
      done();
    });
  });

  it('throws UnauthorizedException if no user and route is not public/GET', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    const context = makeContext({ user: undefined, method: 'POST' });
    const next = makeNext();

    expect(() => interceptor.intercept(context, next)).toThrow(UnauthorizedException);
  });

  it('passes through if no user but route IS public', (done) => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const context = makeContext({ user: undefined, method: 'POST' });
    const next = makeNext('public result');

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toBe('public result');
      expect(mockDb.runInRlsTransaction).not.toHaveBeenCalled();
      done();
    });
  });

  it('passes through if no user but method is GET', (done) => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    const context = makeContext({ user: undefined, method: 'GET' });
    const next = makeNext('get result');

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toBe('get result');
      expect(mockDb.runInRlsTransaction).not.toHaveBeenCalled();
      done();
    });
  });

  it('wraps the request in an RLS transaction when a user is present', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    const context = makeContext({ user: { id: 'user-123' }, method: 'POST' });
    const next = makeNext('authenticated result');

    const result = await interceptor.intercept(context, next).toPromise();

    expect(result).toBe('authenticated result');
    expect(mockDb.runInRlsTransaction).toHaveBeenCalledWith('user-123', expect.any(Function));
  });

  it('falls back to request.user.sub if request.user.id is missing', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    const context = makeContext({ user: { sub: 'sub-456' }, method: 'POST' });
    const next = makeNext('result');

    await interceptor.intercept(context, next).toPromise();

    expect(mockDb.runInRlsTransaction).toHaveBeenCalledWith('sub-456', expect.any(Function));
  });
});