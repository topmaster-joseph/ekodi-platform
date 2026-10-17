// Pure validation and aggregation module. No authentication bypass, network or storage.
export const CROPS = Object.freeze(['onion','garlic','sweet_potato','greenhouse','other']);
export const HOUSING = Object.freeze(['ready','preparing','support_needed']);
export const STATUSES = Object.freeze(['submitted','under_review','approved','rejected','cancelled']);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function validateFarmDemand(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid_payload');
  const crop = value.crop, housing_status = value.housing_status, start_month = value.start_month;
  const workers = value.workers, duration_months = value.duration_months;
  if (!CROPS.includes(crop)) throw new RangeError('invalid_crop');
  if (!Number.isSafeInteger(workers) || workers < 1 || workers > 1000) throw new RangeError('invalid_workers');
  if (typeof start_month !== 'string' || !MONTH.test(start_month)) throw new RangeError('invalid_start_month');
  if (!Number.isSafeInteger(duration_months) || duration_months < 1 || duration_months > 8) throw new RangeError('invalid_duration');
  if (!HOUSING.includes(housing_status)) throw new RangeError('invalid_housing');
  return Object.freeze({crop,workers,start_month,duration_months,housing_status});
}

export function summarizeFarmDemands(records) {
  if (!Array.isArray(records)) throw new TypeError('invalid_records');
  const result = {total:0,submitted:0,under_review:0,approved:0,rejected:0,cancelled:0,requested_workers:0,requested_person_months:0};
  for (const item of records) {
    if (!item || !STATUSES.includes(item.status)) throw new TypeError('invalid_status');
    const v=validateFarmDemand(item);
    result.total++;
    result[item.status]++;
    result.requested_workers+=v.workers;
    result.requested_person_months+=v.workers*v.duration_months;
  }
  return Object.freeze(result);
}
