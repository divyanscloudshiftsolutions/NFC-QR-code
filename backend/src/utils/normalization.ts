export const normalizeEmail = (email?: string | null): string => {
  if (!email) return '';
  return email.trim().toLowerCase();
};

export const normalizePhone = (phone?: string | null): string => {
  if (!phone) return '';
  // Strip formatting characters: spaces, hyphens, parentheses, etc.
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // If it already has country code +91
  if (cleaned.startsWith('+91')) {
    return cleaned;
  }
  
  // If it is a 10-digit number starting with 6-9, prepend +91 for Indian phone numbers
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  
  return cleaned;
};
