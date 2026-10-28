// The shapes a reader of runespect's tree and event log can rely on. The wire format itself
// (message constructors, diffing, value encoding) is in `@runespect/agent/protocol/internal` and changes
// with the protocol version.
export { PROTOCOL_VERSION } from './internal.ts';
export type {
  SerializedNode,
  SymbolKind,
  Message,
  TreeOp,
  EncodedValue,
  DehydratedValue,
  ErrorValue,
  Commit,
  Change,
  RunespectEvent,
  Hop,
  EventKind,
} from './internal.ts';
