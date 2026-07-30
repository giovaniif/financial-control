/**
 * An amount of Brazilian Real in **integer cents**. `R$ 1.234,56` is `123456`.
 *
 * Every amount crosses the wire this way, matching the backend's `Money` value
 * object. Nothing in the API ever sends reais as a decimal number: accumulated
 * float drift is the specific failure the spreadsheet this replaces had.
 */
export type Cents = number;
