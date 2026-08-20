import financeWorker from './finance-worker.js';
import taxInvoiceWorker from './tax-invoice-free-first-worker.js';

const FINANCE_TABLES = Object.freeze({
  organizations: 'finance_organizations',
  business_units: 'finance_business_units',
  projects: 'finance_projects',
  payment_orders: 'finance_payment_orders',
  payments: 'finance_payments',
  accounting_entries: 'finance_accounting_entries',
  integration_events: 'finance_integration_events',
  tax_profiles: 'finance_tax_profiles',
  tax_customers: 'finance_tax_customers',
  tax_invoices: 'finance_tax_invoices',
  tax_invoice_events: 'finance_tax_invoice_events'
});

const TABLE_PATTERN = new RegExp(`\\b(${Object.keys(FINANCE_TABLES).join('|')})\\b`, 'g');

export function namespaceFinanceSql(sql) {
  return String(sql).replace(TABLE_PATTERN, table => FINANCE_TABLES[table]);
}

function namespacedDatabase(db) {
  if (!db) return db;
  return new Proxy(db, {
    get(target, property) {
      if (property === 'prepare') {
        return sql => target.prepare(namespaceFinanceSql(sql));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

export default {
  fetch(request, env, ctx) {
    const financeEnv = Object.create(env || null);
    if (env?.DB) financeEnv.DB = namespacedDatabase(env.DB);
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/api/finance/tax-')) return taxInvoiceWorker.fetch(request, financeEnv, ctx);
    return financeWorker.fetch(request, financeEnv, ctx);
  }
};
