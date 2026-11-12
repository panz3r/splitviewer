// App-level error types for the domain layer (MVC refactor). Transport-level
// errors that already exist (SplitwiseAuthError) are re-exported here so
// domain/service code can import every error it may surface from one place.
export { SplitwiseAuthError } from "../lib/splitwise";

/** A caller-visible "resource does not exist (or is no longer active)" error. */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** A caller-supplied input failed validation (maps to HTTP 400). */
export class InvalidInputError extends Error {
  constructor(message = "Invalid input") {
    super(message);
    this.name = "InvalidInputError";
  }
}
