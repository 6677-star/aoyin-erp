/**
 * @typedef {Object} CompanyProfile
 * @property {number} id
 * @property {string} company_name
 * @property {string | null} company_address
 * @property {string | null} contact_phone
 * @property {string | null} email
 * @property {string | null} logo_url
 * @property {string | null} remark
 * @property {boolean} is_active
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} AppUser
 * @property {number} id
 * @property {string} username
 * @property {string} real_name
 * @property {'admin' | 'warehouse' | 'sales' | 'viewer'} role
 * @property {'active' | 'disabled'} status
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} DeliveryOrder
 * @property {string} id
 * @property {string} order_no
 * @property {string | null} customer_id
 * @property {string} customer_name
 * @property {string} delivery_date
 * @property {string} operator
 * @property {string | null} remark
 */

export {};
