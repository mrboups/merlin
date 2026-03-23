export { Merlin } from './merlin.js';
export type { MerlinConfig } from './config/index.js';

// Re-export module public APIs
export {
  WalletService,
  type WalletModuleConfig,
  type IWalletAccount,
  type IWalletManager,
  type TransactionParams,
  type FeeRates,
  type WalletManagerConstructor,
} from './modules/wallet/index.js';

export {
  ProviderService,
  ProviderBackend,
  type ProviderModuleConfig,
  type ChainRpcConfig,
  type IProvider,
  type TransactionReceipt,
} from './modules/provider/index.js';

export {
  PrivacyService,
  PrivacyProtocol,
  type PrivacyProviderConstructor,
  type PrivacyModuleConfig,
  type ShieldedBalance,
  type ShieldParams,
  type UnshieldParams,
  type PrivateTransferParams,
  type PrivacyTransactionResult,
  type IPrivacyProvider,
} from './modules/privacy/index.js';

export {
  TransactionService,
  TransactionMode,
  type TransactionRequest,
  type UnifiedTransactionResult,
} from './modules/transaction/index.js';

// Re-export shared types
export {
  MerlinError,
  MerlinErrorCode,
  type Hex,
  type BlockchainId,
  type ChainId,
  type TokenAddress,
  type SeedPhrase,
  type SeedBytes,
  type SeedInput,
  type TransactionResult,
  type ModuleConfig,
} from './types/index.js';
