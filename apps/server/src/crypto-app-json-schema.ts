/**
 * Compatibility export. The public developer SDK and trusted server share one
 * closed JSON-schema evaluator so local fixtures cannot drift from runtime
 * input validation and output projection.
 */
export {
  projectCryptoAppOutput,
  validateCryptoAppInput,
  validateCryptoAppSchemaDefinition,
  type CryptoAppSchemaResult,
} from "@matterhorn-work/crypto-app-sdk/json-schema";
