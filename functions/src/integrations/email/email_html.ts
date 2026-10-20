import { escapeHtml } from "./resend_client";

/**
 * Markup the code inserts into Resend templates through `_html` variables.
 * Kept table-based with inline styles to match the templates' layout in every email client.
 */
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const GREEN = "#458500";
const TABLE = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"';

const textStyle = (size: number, color = "#666666", weight = "400"): string =>
  `font-family:${FONT};font-size:${size}px;line-height:1.5;color:${color};font-weight:${weight};`;

/** One line in an item list: optional image, name, detail lines, and optional price. */
export const itemRowHtml = (item: { name: string; details?: string[]; price?: string; imageUrl?: string }): string => {
  const image = item.imageUrl ?
    `<td width="80" valign="top" style="width:80px;padding-right:16px;"><img src="${escapeHtml(item.imageUrl)}" width="64" height="64" border="0" alt="${escapeHtml(item.name)}" style="display:block;width:64px;height:64px;border:1px solid #e5e5e5;border-radius:4px;object-fit:cover;"></td>` :
    "";
  const details = (item.details || [])
    .map((detail) => `<p style="margin:0 0 4px 0;${textStyle(13)}">${escapeHtml(detail)}</p>`).join("");
  const price = item.price ? `<p style="margin:4px 0 0 0;${textStyle(14, "#000000", "500")}">${escapeHtml(item.price)}</p>` : "";
  return `
<table ${TABLE} style="border-bottom:1px solid #f0f0f0;margin-bottom:16px;">
  <tr>
    ${image}<td valign="top" style="padding-bottom:16px;">
      <p style="margin:0 0 4px 0;${textStyle(14, "#000000", "500")}">${escapeHtml(item.name)}</p>${details}${price}
    </td>
  </tr>
</table>`;
};

/** Discount row for an order totals table; replaces the EmailJS {{#has_discount}} section. */
export const discountRowHtml = (code?: string, percent?: number, amount?: number): string => code ? `
<tr>
  <td style="padding-top:8px;padding-bottom:8px;${textStyle(14, "#2E7D32")}">Discount (${escapeHtml(code)} - ${percent || 0}% off)</td>
  <td align="right" style="padding-top:8px;padding-bottom:8px;${textStyle(14, "#2E7D32", "600")}">-$${(amount || 0).toFixed(2)}</td>
</tr>` : "";

/** Centered green call-to-action button matching the templates' buttons. */
export const buttonHtml = (url: string, label: string): string => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 8px auto;">
  <tr>
    <td align="center" bgcolor="${GREEN}" style="background-color:${GREEN};border-radius:6px;">
      <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 32px;${textStyle(15, "#ffffff", "600")}text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
