// Preview details fill empty settings; saved shop details always take priority.
export function shopContact(config: {
  shopPhone?: string | null;
  shopEmail?: string | null;
  shopAddress?: string | null;
}) {
  return {
    phone: config.shopPhone?.trim() || "(602) 555-0147",
    email: config.shopEmail?.trim() || "hello@example.com",
    address: config.shopAddress?.trim() || "123 Example Lane, Phoenix, AZ 85001",
    hasAddress: Boolean(config.shopAddress?.trim()),
  };
}
