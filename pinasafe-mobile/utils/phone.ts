function formatPhoneNumber(input:string) {
  if (!input) return null;

  // Remove non-digits
  let digits = input.replace(/\D/g, "");

  // Normalize to start with 63
  if (digits.startsWith("0")) {
    digits = "63" + digits.substring(1);
  } else if (!digits.startsWith("63")) {
    digits = "63" + digits;
  }

  // Restrict to PH length
  digits = digits.substring(0, 12); // 63 + 10 numbers

  const cc = digits.substring(0, 2);       // 63
  const a = digits.substring(2, 5);        // 912
  const b = digits.substring(5, 8);        // 345
  const c = digits.substring(8, 12);       // 6789

  let formatted = `+${cc}`;
  if (a) formatted += `-${a}`;
  if (b) formatted += `-${b}`;
  if (c) formatted += `-${c}`;

  return formatted;
}

/**
 * Validate PH mobile number length
 */
function isValidPhoneNumber(input:string) {
  if (!input) return false;

  const digits = input.replace(/\D/g, "");
  return digits.length === 12; // 63 + 10 digits
}

export { formatPhoneNumber, isValidPhoneNumber };