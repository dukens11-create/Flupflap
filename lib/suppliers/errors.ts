export class SupplierConfigError extends Error {
  readonly code = 'MISSING_SUPPLIER_CREDENTIALS';
  constructor(public readonly provider: string, public readonly missingKeys: string[]) {
    super(`Missing required supplier credentials for ${provider}: ${missingKeys.join(', ')}`);
    this.name = 'SupplierConfigError';
  }
}

export class SupplierIntegrationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly provider?: string,
    public readonly operation?: string,
  ) {
    super(message);
    this.name = 'SupplierIntegrationError';
  }
}
