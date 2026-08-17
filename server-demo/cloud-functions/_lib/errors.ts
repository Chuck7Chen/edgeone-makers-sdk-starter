/**
 * 把 SDK 的类型化异常映射成 HTTP 状态码。
 *
 * 这是把 SDK 用进任何 HTTP 服务时都要写的一层。SDK 只负责抛出语义明确的
 * 异常，怎么翻译成 HTTP 语义是调用方的决定 —— 下面这张表就是本 demo 的决定。
 */
import {
  AuthError,
  ConflictError,
  MakersError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  UploadError,
  ValidationError,
} from "./sdk.js";

/** 顺序有意义：DeploymentTimeoutError 继承 TimeoutError，子类必须排在父类前面。 */
const STATUS_TABLE: ReadonlyArray<readonly [abstract new (...args: never) => Error, number]> = [
  [ValidationError, 400],
  [AuthError, 401],
  [NotFoundError, 404],
  [ConflictError, 409],
  [RateLimitError, 429],
  [UploadError, 502],
  [TimeoutError, 504],
];

export function httpStatusFor(error: unknown): number {
  for (const [type, status] of STATUS_TABLE) {
    if (error instanceof type) return status;
  }
  return error instanceof MakersError ? 500 : 500;
}

export interface SerializedError {
  name: string;
  message: string;
  code: string | null;
  requestId: string | null;
  httpStatus: number | null;
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof MakersError) {
    // 网络层失败时 code / requestId / httpStatus 全是 null，前端要能接受这一点。
    return {
      name: error.name,
      message: error.message,
      code: error.code ?? null,
      requestId: error.requestId ?? null,
      httpStatus: error.httpStatus ?? null,
    };
  }
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    code: null,
    requestId: null,
    httpStatus: null,
  };
}
