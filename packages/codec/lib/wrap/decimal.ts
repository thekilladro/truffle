import debugModule from "debug";
const debug = debugModule("codec:wrap:decimal");

import type * as Format from "@truffle/codec/format";
import { wrapWithCases } from "./dispatch";
import { TypeMismatchError, BadResponseTypeError } from "./errors";
import type { WrapResponse, DecimalWrapRequest } from "../types";
import type {
  Case,
  DecimalType,
  DecimalValue,
  IntegerType,
  IntegerValue,
  WrapOptions
} from "./types";
import * as Conversion from "@truffle/codec/conversion";
import * as Utils from "./utils";
import * as Messages from "./messages";
import BN from "bn.js";
import Big from "big.js";

const decimalCasesBasic: Case<
  DecimalType,
  DecimalValue,
  DecimalWrapRequest
>[] = [
  decimalFromNumber,
  decimalFromString, //only one case of this, unlike integers!
  decimalFromBoxedNumber,
  decimalFromBoxedString,
  decimalFromBigint,
  decimalFromBN,
  decimalFromBig,
  decimalFromDecimalValue,
  decimalFromIntegerValue,
  decimalFromEnumValue,
  decimalFromEnumError,
  decimalFromOther //must go last!
];

export const decimalCases: Case<
  DecimalType,
  DecimalValue,
  DecimalWrapRequest
>[] = [
  decimalFromTypeValueInput,
  ...decimalCasesBasic
];

function* decimalFromBig(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, DecimalValue, WrapResponse> {
  if (!Conversion.isBig(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a Big"
    );
  }
  const asBig = input.plus(0); //clone
  validate(dataType, asBig, input, wrapOptions.name);
  return <DecimalValue>{ //IDK why TS is screwing up here
    type: dataType,
    kind: "value" as const,
    value: {
      asBig
    }
  };
}

function* decimalFromBN(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, DecimalValue, WrapResponse> {
  if (!BN.isBN(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a BN"
    );
  }
  const asBig = Conversion.toBig(input);
  validate(dataType, asBig, input, wrapOptions.name);
  return <DecimalValue>{ //IDK why TS is screwing up here
    type: dataType,
    kind: "value" as const,
    value: {
      asBig
    }
  };
}

function* decimalFromBigint(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, DecimalValue, WrapResponse> {
  if (typeof input !== "bigint") {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a bigint"
    );
  }
  const asBig = Conversion.toBig(input);
  validate(dataType, asBig, input, wrapOptions.name);
  return <DecimalValue>{ //IDK why TS is screwing up here
    type: dataType,
    kind: "value" as const,
    value: {
      asBig
    }
  };
}

function* decimalFromString(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, DecimalValue, WrapResponse> {
  if (typeof input !== "string") {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a string"
    );
  }
  const trimmed = input.trim(); //allow whitespace
  let asBig: Big;
  try {
    asBig = new Big(trimmed);
  } catch {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.nonNumericMessage
    );
  }
  validate(dataType, asBig, input, wrapOptions.name);
  return <DecimalValue>{ //IDK why TS is screwing up here
    type: dataType,
    kind: "value" as const,
    value: {
      asBig
    }
  };
}

function* decimalFromNumber(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, DecimalValue, WrapResponse> {
  if (typeof input !== "number") {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a number"
    );
  }
  if (!Number.isFinite(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      "Numeric value is not finite"
    );
  }
  if (!Utils.isSafeNumber(dataType, input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      "Given number is outside the safe range for this data type (possible loss of precision); use a numeric string, bigint, or big number class instead"
    );
  }
  const asBig = new Big(input);
  validate(dataType, asBig, input, wrapOptions.name);
  return <DecimalValue>{ //IDK why TS is screwing up here
    type: dataType,
    kind: "value" as const,
    value: {
      asBig
    }
  };
}

function* decimalFromBoxedString(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, DecimalValue, WrapResponse> {
  if (!Utils.isBoxedString(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a boxed string"
    );
  }
  //unbox and try again
  return yield* decimalFromString(dataType, input.valueOf(), wrapOptions);
}

function* decimalFromBoxedNumber(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, DecimalValue, WrapResponse> {
  if (!Utils.isBoxedNumber(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a boxed number"
    );
  }
  //unbox and try again
  return yield* decimalFromNumber(dataType, input.valueOf(), wrapOptions);
}

function* decimalFromDecimalValue(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, DecimalValue, WrapResponse> {
  if (!Utils.isWrappedResult(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a wrapped result"
    );
  }
  if (
    input.type.typeClass !== "fixed" &&
    input.type.typeClass !== "ufixed"
  ) {
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
    (input.type.typeClass !== dataType.typeClass ||
      input.type.bits !== dataType.bits ||
      input.type.places !== dataType.places)
  ) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.wrappedTypeMessage(input.type)
    );
  }
  const asBig = (<DecimalValue>input).value.asBig.plus(0); //clone
  validate(dataType, asBig, input, wrapOptions.name);
  return <DecimalValue>{ //IDK why TS is screwing up here
    type: dataType,
    kind: "value" as const,
    value: {
      asBig
    }
  };
}

function* decimalFromIntegerValue(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, DecimalValue, WrapResponse> {
  if (!Utils.isWrappedResult(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a wrapped result"
    );
  }
  if (
    input.type.typeClass !== "int" &&
    input.type.typeClass !== "uint"
  ) {
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
  if (!wrapOptions.loose) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.wrappedTypeMessage(input.type)
    );
  }
  const asBig = Conversion.toBig((<IntegerValue>input).value.asBN);
  validate(dataType, asBig, input, wrapOptions.name);
  return <DecimalValue>{ //IDK why TS is screwing up here
    type: dataType,
    kind: "value" as const,
    value: {
      asBig
    }
  };
}

function* decimalFromEnumValue(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, DecimalValue, WrapResponse> {
  if (!Utils.isWrappedResult(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a wrapped result"
    );
  }
  if (input.type.typeClass !== "enum") {
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
      1, //only specificity 1 due to EnumError case
      Messages.errorResultMessage
    );
  }
  if (!wrapOptions.loose) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.wrappedTypeMessage(input.type)
    );
  }
  const asBig = Conversion.toBig((<Format.Values.EnumValue>input).value.numericAsBN);
  validate(dataType, asBig, input, wrapOptions.name);
  return <DecimalValue>{ //IDK why TS is screwing up here
    type: dataType,
    kind: "value" as const,
    value: {
      asBig
    }
  };
}

function* decimalFromEnumError(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<never, DecimalValue, WrapResponse> {
  if (!Utils.isWrappedResult(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a wrapped result"
    );
  }
  if (input.type.typeClass !== "enum") {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.wrappedTypeMessage(input.type)
    );
  }
  if (input.kind !== "error") {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Wrapped result was a value rather than an error"
    );
  }
  if (!wrapOptions.loose) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.wrappedTypeMessage(input.type)
    );
  }
  const coercedInput = <Format.Errors.EnumErrorResult>input;
  //only one specific kind of error will be allowed
  if (coercedInput.error.kind !== "EnumOutOfRangeError") {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.errorResultMessage
    );
  }
  const asBig = Conversion.toBig(coercedInput.error.rawAsBN);
  validate(dataType, asBig, input, wrapOptions.name);
  return <DecimalValue>{ //IDK why TS is screwing up here
    type: dataType,
    kind: "value" as const,
    value: {
      asBig
    }
  };
}

function* decimalFromTypeValueInput(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<DecimalWrapRequest, DecimalValue, WrapResponse> {
  if (!Utils.isTypeValueInput(input)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      1,
      "Input was not a type/value pair"
    );
  }
  if (!input.type.match(/^u?fixed(\d+(x\d+)?)?$/)) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      5,
      Messages.specifiedTypeMessage(input.type)
    );
  }
  const [
    _0,
    typeClass,
    _2,
    bitsAsString,
    _4,
    placesAsString
  ] = input.type.match(/^(u?fixed)((\d+)(x(\d+))?)?$/);
  //not all of the fields in this match are used, so we discard them into _n variables
  const bits = bitsAsString ? Number(bitsAsString) : 128; //defaults to 128
  const places = placesAsString ? Number(placesAsString) : 18; //defaults to 18
  if (
    dataType.typeClass !== typeClass ||
    dataType.bits !== bits ||
    dataType.places !== places
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
    decimalCasesBasic
  );
}

function* decimalFromOther(
  dataType: DecimalType,
  input: unknown,
  wrapOptions: WrapOptions
): Generator<DecimalWrapRequest, DecimalValue, WrapResponse> {
  const request = { kind: "decimal" as const, input };
  const response = yield request;
  if (response.kind !== "decimal") {
    throw new BadResponseTypeError(request, response);
  }
  if (response.value === null) {
    throw new TypeMismatchError(
      dataType,
      input,
      wrapOptions.name,
      response.partiallyRecognized ? 5 : 3,
      response.reason || Messages.unrecognizedNumberMessage(dataType)
    );
  }
  const asBig = response.value.plus(0); //clone
  validate(dataType, asBig, input, wrapOptions.name);
  return <DecimalValue>{ //IDK why TS is screwing up here
    type: dataType,
    kind: "value" as const,
    value: {
      asBig
    }
  };
}

function validate(
  dataType: DecimalType,
  asBig: Big,
  input: unknown, //just for errors
  name: string //for errors
): void {
  if (Conversion.countDecimalPlaces(asBig) > dataType.places) {
    throw new TypeMismatchError(
      dataType,
      input,
      name,
      5,
      Messages.tooPreciseMessage(dataType.places, Conversion.countDecimalPlaces(asBig))
    );
  }
  if (
    asBig.gt(Utils.maxValue(dataType)) ||
    asBig.lt(Utils.minValue(dataType))
  ) {
    throw new TypeMismatchError(
      dataType,
      input,
      name,
      5,
      Messages.outOfRangeMessage
    );
  }
}
