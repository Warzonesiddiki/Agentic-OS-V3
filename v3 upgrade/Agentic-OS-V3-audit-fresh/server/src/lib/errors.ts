/**
 * errors.ts — typed API error with HTTP code derivation.
 */
import { statusForCode } from "./envelope.js";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.status = statusForCode(code);
  }
}
