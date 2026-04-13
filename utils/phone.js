const normalizePhone = (phone) => {
  if (typeof phone !== "string") {
    return "";
  }

  return phone.replace(/\D/g, "");
};

const lastTenDigits = (phone) => {
  const digits = normalizePhone(phone);
  return digits.length > 10 ? digits.slice(-10) : digits;
};

module.exports = {
  normalizePhone,
  lastTenDigits
};
