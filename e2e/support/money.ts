const formatter = new Intl.NumberFormat('id-ID');

/** The app renders whole Rupiah with Indonesian thousands separators: Rp 1.234.567. */
export function rp(amount: number): string {
  return `Rp ${formatter.format(amount)}`;
}
