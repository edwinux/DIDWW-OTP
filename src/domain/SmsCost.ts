/**
 * SMS Cost Value Object
 *
 * Handles currency values with proper precision by storing as integer cents.
 * Avoids floating-point precision issues common with decimal currency values.
 */

export class SmsCost {
  private readonly cents: number;

  private constructor(cents: number) {
    this.cents = Math.round(cents);
  }

  /**
   * Create from USD decimal value
   */
  static fromUsd(usd: number): SmsCost {
    // Convert USD to cents (multiply by 100, then by 100 again for sub-cent precision)
    // Store as 1/10000 of a dollar (0.01 cents) to preserve DIDWW precision
    return new SmsCost(Math.round(usd * 10000));
  }

  /**
   * Create from DIDWW price and fragment count
   * Returns null if inputs are invalid
   */
  static fromDidww(price: number | null | undefined, fragments: number | null | undefined): SmsCost | null {
    if (price === null || price === undefined || fragments === null || fragments === undefined) {
      return null;
    }
    if (isNaN(price) || isNaN(fragments) || fragments < 0 || price < 0) {
      return null;
    }
    const totalUsd = price * fragments;
    // Guard against overflow, infinity, or unexpected negative results
    if (!isFinite(totalUsd) || totalUsd < 0) {
      return null;
    }
    return SmsCost.fromUsd(totalUsd);
  }

  /**
   * Get value in 1/10000 dollars (for DB storage)
   * This preserves sub-cent precision from DIDWW pricing
   */
  toStorageUnits(): number {
    return this.cents;
  }

  /**
   * Create from storage units (1/10000 dollars)
   */
  static fromStorageUnits(units: number): SmsCost {
    return new SmsCost(units);
  }

  /**
   * Get value in USD (for display)
   */
  toUsd(): number {
    return this.cents / 10000;
  }

  /**
   * Format for display with appropriate decimal places
   */
  format(): string {
    const usd = this.toUsd();
    // Show 4 decimal places for small amounts typical of SMS
    return `$${usd.toFixed(4)}`;
  }

  /**
   * Format for display with 2 decimal places (for totals)
   */
  formatTotal(): string {
    const usd = this.toUsd();
    return `$${usd.toFixed(2)}`;
  }
}
