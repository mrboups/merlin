import { MerlinError, MerlinErrorCode } from '../../types/common.js';
import type { WalletService } from '../wallet/wallet.service.js';
import type { PrivacyService } from '../privacy/privacy.service.js';
import { PrivacyProtocol } from '../privacy/privacy.types.js';
import {
  TransactionMode,
  type TransactionRequest,
  type UnifiedTransactionResult,
} from './transaction.types.js';

/**
 * TransactionService is the high-level orchestrator for sending transactions.
 * It routes requests to either the WalletService (public transactions) or
 * the PrivacyService (shielded transactions) based on the requested mode.
 *
 * This is the "Merlin" layer -- the unified interface that makes privacy
 * a first-class transaction mode rather than a separate workflow.
 */
export class TransactionService {
  constructor(
    private readonly walletService: WalletService,
    private readonly privacyService: PrivacyService,
  ) {}

  /**
   * Send a transaction using the specified mode.
   */
  async send(request: TransactionRequest): Promise<UnifiedTransactionResult> {
    switch (request.mode) {
      case TransactionMode.PUBLIC:
        return this.sendPublic(request);
      case TransactionMode.SHIELDED:
        return this.sendShielded(request);
      default:
        throw new MerlinError(
          MerlinErrorCode.TRANSACTION_FAILED,
          `Unsupported transaction mode: ${request.mode}`,
          { mode: request.mode },
        );
    }
  }

  private async sendPublic(request: TransactionRequest): Promise<UnifiedTransactionResult> {
    if (!this.walletService.hasWallet(request.blockchain)) {
      throw new MerlinError(
        MerlinErrorCode.WALLET_NOT_REGISTERED,
        `No wallet registered for blockchain: ${request.blockchain}`,
        { blockchain: request.blockchain },
      );
    }

    const account = await this.walletService.getAccount(
      request.blockchain,
      request.accountIndex ?? 0,
    );

    const result = await account.sendTransaction({
      to: request.to as `0x${string}`,
      value: request.amount,
      data: request.data,
    });

    return {
      hash: result.hash,
      fee: result.fee,
      mode: TransactionMode.PUBLIC,
      confirmed: true,
    };
  }

  private async sendShielded(request: TransactionRequest): Promise<UnifiedTransactionResult> {
    // Determine which privacy protocol to use.
    // Default to Railgun if available, otherwise try Privacy Pools.
    const protocol = this.resolvePrivacyProtocol(request.chainId);

    if (!request.token) {
      throw new MerlinError(
        MerlinErrorCode.TRANSACTION_FAILED,
        'Shielded transfers require a token address',
        { chainId: request.chainId },
      );
    }

    const result = await this.privacyService.privateTransfer(protocol, request.chainId, {
      token: request.token,
      amount: request.amount,
      toShieldedAddress: request.to,
    });

    return {
      hash: result.hash,
      fee: result.fee,
      mode: TransactionMode.SHIELDED,
      confirmed: result.confirmed,
    };
  }

  private resolvePrivacyProtocol(chainId: number): PrivacyProtocol {
    if (this.privacyService.hasProtocol(PrivacyProtocol.RAILGUN, chainId)) {
      return PrivacyProtocol.RAILGUN;
    }
    if (this.privacyService.hasProtocol(PrivacyProtocol.PRIVACY_POOLS, chainId)) {
      return PrivacyProtocol.PRIVACY_POOLS;
    }
    throw new MerlinError(
      MerlinErrorCode.PRIVACY_PROTOCOL_ERROR,
      `No privacy protocol registered for chain ${chainId}`,
      { chainId },
    );
  }
}
