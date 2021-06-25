import debugModule from "debug";
const debug = debugModule("codec:wrap:bytes");

import type * as Format from "@truffle/codec/format";
import { wrapWithCases } from "./dispatch";
import { TypeMismatchError } from "./errors";
import type { WrapResponse } from "../types";
import type { Case, WrapOptions, Uint8ArrayLike } from "./types";
import * as Conversion from "@truffle/codec/conversion";
import * as Utils from "./utils";
import * as Messages from "./messages";

const bytesCasesBasic: Case<
  Format.Types.BytesType,
  Format.Values.BytesValue,
  never
>[] = [
  bytesFromHexString,
  bytesFromBoxedString,
  bytesFromUint8ArrayLike,
  bytesFromBytesValue,
  bytesFromEncodingTextInput,
  bytesFailureCase
];

export const bytesCases: Case<
  Format.Types.BytesType,
  Format.Values.BytesValue,
  never
>[] = [
  bytesFromTypeValueInput,
  ...bytesCasesBasic
];

function* bytesFromHexString(
  dataType: Format.Types.BytesType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, Format.Values.BytesValue, WrapResponse> {
  if (typeof input !== "string") {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a string"
    );
  }
  if (!Utils.isByteString(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.notABytestringMessage("Input")
    );
  }
  const asHex = validateAndPad(dataType, input, input, wrapOptions.name);
  return <Format.Values.BytesValue>{ //TS is complaining again
    type: dataType,
    kind: "value" as const,
    value: {
      asHex
    }
  };
}

function* bytesFromBoxedString(
  dataType: Format.Types.BytesType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, Format.Values.BytesValue, WrapResponse> {
  if (!Utils.isBoxedString(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a boxed string"
    );
  }
  //defer to primitive string case
  return yield* bytesFromHexString(dataType, input.valueOf(), wrapOptions);
}

function* bytesFromUint8ArrayLike(
  dataType: Format.Types.BytesType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, Format.Values.BytesValue, WrapResponse> {
  if (!Utils.isUint8ArrayLike(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a Uint8Array-like"
    );
  }
  //the next series of checks is delegated to a helper fn
  validateUint8ArrayLike(input, dataType, wrapOptions.name); //(this fn just throws an appropriate error if something's bad)
  let asHex = Conversion.toHexString(new Uint8Array(input)); //I am surprised TS accepts this!
  asHex = validateAndPad(dataType, asHex, input, wrapOptions.name);
  return <Format.Values.BytesValue>{ //TS is complaining again
    type: dataType,
    kind: "value" as const,
    value: {
      asHex
    }
  };
}

function* bytesFromEncodingTextInput(
  dataType: Format.Types.BytesType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, Format.Values.BytesValue, WrapResponse> {
  if (!Utils.isEncodingTextInput(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a in encoding/text form"
    );
  }
  if (input.encoding !== "utf8") { //(the only allowed encoding :P )
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      `Unknown or unsupported text encoding ${input.encoding}`
    );
  }
  let asHex: string;
  try {
    asHex = Conversion.toHexString(Conversion.stringToBytes(input.text));
  } catch {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.invalidUtf16Message
    );
  }
  asHex = validateAndPad(dataType, asHex, input, wrapOptions.name);
  return <Format.Values.BytesValue>{ //TS is complaining again
    type: dataType,
    kind: "value" as const,
    value: {
      asHex
    }
  };
}

function* bytesFromBytesValue(
  dataType: Format.Types.BytesType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, Format.Values.BytesValue, WrapResponse> {
  if (!Utils.isWrappedResult(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a wrapped result"
    );
  }
  if (input.type.typeClass !== "bytes") {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.wrappedTypeMessage(input.type)
    );
  }
  if (input.kind !== "value") {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.errorResultMessage
    );
  }
  if (
    !wrapOptions.loose &&
    !(input.type.kind === "dynamic" && dataType.kind === "dynamic") &&
    !(input.type.kind === "static" &&
      dataType.kind === "static" &&
      input.type.length === dataType.length)
  ) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.wrappedTypeMessage(input.type)
    );
  }
  let asHex = (<Format.Values.BytesValue>input).value.asHex;
  asHex = validateAndPad(dataType, asHex, input, wrapOptions.name);
  return <Format.Values.BytesValue>{ //TS is complaining again
    type: dataType,
    kind: "value" as const,
    value: {
      asHex
    }
  };
}

function* bytesFromTypeValueInput(
  dataType: Format.Types.BytesType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, Format.Values.BytesValue, WrapResponse> {
  if (!Utils.isTypeValueInput(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a type/value pair"
    );
  }
  if (!input.type.match(/^byte(s\d*)?$/)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.specifiedTypeMessage(input.type)
    );
  }
  debug("input.type: %s", input.type);
  //now: determine the specified length; we use "null" for dynamic
  //note that "byte" is allowed, with a length of 1
  let length: number | null = null;
  let match = input.type.match(/^bytes(\d+)$/);
  if (match) {
    length = Number(match[1]); //static case with specified number
  } else if (input.type === "byte") {
    //"byte" case; set length to 1
    length = 1;
  }
  //otherwise, it's dynamic, so leave it at the default of null
  debug("length: %o", length);
  //check: does the specified length match the data type length?
  if (
    !(length === null && dataType.kind === "dynamic") &&
    !(dataType.kind === "static" && length === dataType.length)
  ) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.specifiedTypeMessage(input.type)
    );
  }
  //extract value & try again, with loose option turned on
  return yield* wrapWithCases(
    dataType,
    input.value,
    { ...wrapOptions, loose: true },
    bytesCasesBasic
  );
}

function* bytesFailureCase(
  dataType: Format.Types.BytesType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, never, WrapResponse> {
  throw new TypeMismatchError(
    dataType,
    input,
    wrapOptions.name,
    2,
   "Input was not a hex string, byte-array-alike, encoding/text pair, type/value pair, or wrapped bytestring"
  );
}

export function validateUint8ArrayLike(
  input: Uint8ArrayLike,
  dataType: Format.Types.Type, //for error information
  name: string //for error information
): void {
  //this function doesn't return anything, it just throws errors if something
  //goes wrong
  if (input instanceof Uint8Array) {
    return; //honest Uint8Arrays don't need checking
  }
  if (!Number.isSafeInteger(input.length)) {
    throw new TypeMismatchError(
      dataType,
      input,
      name,
      5,
      "Input is byte-array-like, but its length is not a safe integer"
    );
  }
  if (input.length < 0) {
    throw new TypeMismatchError(
      dataType,
      input,
      name,
      5,
      "Input is byte-array-like, but its length is negative"
    );
  }
  //check: is it actually like a Uint8Array?
  for (let index = 0; index < input.length; index++) {
    if (
      typeof input[index] !== "number" ||
      input[index] < 0 ||
      input[index] >= 256 ||
      !Number.isInteger(input[index])
    ) {
      throw new TypeMismatchError(
        dataType,
        input,
        name,
        5,
        `Input is byte-array-like, but byte ${index} is not a 1-byte value (number from 0 to 255)`
      );
    }
  }
  //otherwise, we didn't throw any errors, so return
}

function validateAndPad(
  dataType: Format.Types.BytesType,
  asHex: string,
  input: unknown, //for errors
  name: string //for errors
): string {
  asHex = asHex.toLowerCase();
  //if static, validate and pad
  if (dataType.kind === "static") {
    if ((asHex.length - 2) / 2 > dataType.length) {
      throw new TypeMismatchError(
        dataType,
        input,
        name,
        5,
        Messages.overlongMessage(dataType.length, (asHex.length - 2) / 2)
      );
    } else {
      asHex = asHex.padEnd(dataType.length * 2 + 2, "00");
    }
  }
  return asHex;
}
