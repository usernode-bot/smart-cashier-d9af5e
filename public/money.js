/* Money helpers for Smart Cashier, shared by the page, the server and the
 * tests (UMD). All amounts travel as integer hundredths of the currency unit
 * regardless of the currency's own decimals: RM 4.50 is 450, Rp 15.000 is
 * 1500000. Only formatMoney/parseMoney know each currency's digits.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SCMoney = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The currencies an owner can pick at setup. `digits` is the currency's
  // usual number of decimals (0 for rupiah, yen and dong; 2 for most).
  var CURRENCIES = {
    MYR: { name: 'Malaysian ringgit', digits: 2, symbol: 'RM' },
    IDR: { name: 'Indonesian rupiah', digits: 0, symbol: 'Rp' },
    SGD: { name: 'Singapore dollar', digits: 2, symbol: 'S$' },
    USD: { name: 'US dollar', digits: 2, symbol: '$' },
    EUR: { name: 'Euro', digits: 2, symbol: '€' },
    GBP: { name: 'British pound', digits: 2, symbol: '£' },
    JPY: { name: 'Japanese yen', digits: 0, symbol: '¥' },
    CNY: { name: 'Chinese yuan', digits: 2, symbol: 'CN¥' },
    HKD: { name: 'Hong Kong dollar', digits: 2, symbol: 'HK$' },
    TWD: { name: 'New Taiwan dollar', digits: 0, symbol: 'NT$' },
    KRW: { name: 'South Korean won', digits: 0, symbol: '₩' },
    THB: { name: 'Thai baht', digits: 2, symbol: '฿' },
    PHP: { name: 'Philippine peso', digits: 2, symbol: '₱' },
    VND: { name: 'Vietnamese dong', digits: 0, symbol: '₫' },
    INR: { name: 'Indian rupee', digits: 2, symbol: '₹' },
    PKR: { name: 'Pakistani rupee', digits: 2, symbol: '₨' },
    BND: { name: 'Brunei dollar', digits: 2, symbol: 'B$' },
    AUD: { name: 'Australian dollar', digits: 2, symbol: 'A$' },
    NZD: { name: 'New Zealand dollar', digits: 2, symbol: 'NZ$' },
    CAD: { name: 'Canadian dollar', digits: 2, symbol: 'C$' },
    CHF: { name: 'Swiss franc', digits: 2, symbol: 'CHF' },
    AED: { name: 'UAE dirham', digits: 2, symbol: 'د.إ' },
    SAR: { name: 'Saudi riyal', digits: 2, symbol: '﷼' },
    TRY: { name: 'Turkish lira', digits: 2, symbol: '₺' },
    BRL: { name: 'Brazilian real', digits: 2, symbol: 'R$' },
    ZAR: { name: 'South African rand', digits: 2, symbol: 'R' },
    MXN: { name: 'Mexican peso', digits: 2, symbol: 'MX$' },
    NGN: { name: 'Nigerian naira', digits: 2, symbol: '₦' },
    KES: { name: 'Kenyan shilling', digits: 2, symbol: 'KSh' },
    EGP: { name: 'Egyptian pound', digits: 2, symbol: 'E£' },
  };

  function currency(code) { return CURRENCIES[code] || CURRENCIES.MYR; }

  // "RM 37.90" with the currency's own digits: the table's symbol in front,
  // then the amount grouped the locale's way. tabular-nums in the page keeps
  // columns of these lined up.
  function formatMoney(cents, code, locale) {
    var c = currency(code);
    var value = Number(cents) / Math.pow(10, c.digits);
    var grouped;
    try {
      grouped = new Intl.NumberFormat(locale || 'en', {
        minimumFractionDigits: c.digits, maximumFractionDigits: c.digits,
        useGrouping: true,
      }).format(value);
    } catch (e) {
      grouped = value.toFixed(c.digits);
    }
    var sep = /^[A-Za-z\u00c0-\u024f]/.test(c.symbol) ? ' ' : '';
    return c.symbol + sep + grouped;
  }

  // The bare amount for receipt lines, without the code ("20.00").
  function formatAmount(cents, code) {
    var c = currency(code);
    return (Number(cents) / Math.pow(10, c.digits)).toFixed(c.digits);
  }

  // "4.50", "4,50" and "15.000" (a zero-digit currency using dots or spaces
  // as group separators) all parse. Returns integer hundredths, or null.
  function parseMoney(text, code) {
    if (typeof text !== 'string') return null;
    var c = currency(code);
    var t = text.trim().replace(/^\$/, '');
    if (!t) return null;
    if (c.digits === 0) {
      // Whole numbers only; strip group separators ("." or " " or ",").
      t = t.replace(/[.,\s]/g, '');
      if (!/^\d{1,12}$/.test(t)) return null;
      return parseInt(t, 10) * 100;
    }
    // Two-digit currencies: strip comma/space group separators only (a dot
    // is the decimal point), so "4.505" fails instead of reading as 4505.
    t = t.replace(/(\d)[,\s](\d{3})(?!\d)/g, '$1$2');
    t = t.replace(',', '.');
    if (!/^\d{1,9}(\.\d{0,2})?$/.test(t)) return null;
    var parts = t.split('.');
    var whole = parts[0] || '0';
    var frac = (parts[1] || '').padEnd(2, '0').slice(0, 2);
    if (whole.length > 10) return null;
    return parseInt(whole, 10) * 100 + parseInt(frac || '0', 10);
  }

  // Common notes of the currency, for the charge sheet's quick-amount
  // buttons: Exact, then the next notes above the total.
  var NOTES = {
    MYR: [1, 5, 10, 50, 100], IDR: [1000, 5000, 10000, 20000, 50000, 100000],
    SGD: [2, 5, 10, 50, 100], USD: [1, 5, 10, 20, 50, 100],
    EUR: [5, 10, 20, 50, 100, 200], GBP: [5, 10, 20, 50],
    JPY: [1000, 5000, 10000], CNY: [1, 5, 10, 20, 50, 100],
    HKD: [10, 50, 100, 500], TWD: [100, 500, 1000], KRW: [1000, 5000, 10000, 50000],
    THB: [20, 50, 100, 500, 1000], PHP: [20, 50, 100, 200, 500, 1000],
    VND: [10000, 20000, 50000, 100000, 200000, 500000],
    INR: [10, 50, 100, 200, 500, 2000], PKR: [10, 50, 100, 500, 1000, 5000],
    BND: [1, 5, 10, 50, 100], AUD: [5, 10, 20, 50, 100],
    NZD: [5, 10, 20, 50, 100], CAD: [5, 10, 20, 50, 100],
    CHF: [10, 20, 50, 100, 200], AED: [5, 10, 20, 50, 100, 200],
    SAR: [5, 10, 50, 100, 500], TRY: [5, 10, 20, 50, 100, 200],
    BRL: [2, 5, 10, 20, 50, 100], ZAR: [10, 20, 50, 100, 200],
    MXN: [20, 50, 100, 200, 500], NGN: [50, 100, 200, 500, 1000],
    KES: [50, 100, 200, 500, 1000], EGP: [25, 50, 100, 200],
  };

  // [cents, label] pairs: Exact, then up to three amounts above the total,
  // smallest first: the next round multiples (10, 50 and 100 units, so a
  // RM 24.80 sale offers 30) and the currency's notes, interleaved.
  function quickCashAmounts(totalCents, code) {
    var out = [[totalCents, 'Exact']];
    var seen = {}; seen[totalCents] = true;
    var cands = (NOTES[code] || []).map(function (n) { return n * 100; });
    [10, 50, 100].forEach(function (m) {
      cands.push(Math.ceil(totalCents / (m * 100)) * m * 100);
    });
    cands = cands.filter(function (v) {
      if (v <= totalCents || seen[v]) return false;
      seen[v] = true; return true;
    });
    cands.sort(function (a, b) { return a - b; })
      .slice(0, 3)
      .forEach(function (v) { seen[v] = true; out.push([v, null]); });
    return out;
  }

  return {
    CURRENCIES: CURRENCIES,
    currency: currency,
    formatMoney: formatMoney,
    formatAmount: formatAmount,
    parseMoney: parseMoney,
    quickCashAmounts: quickCashAmounts,
  };
});
