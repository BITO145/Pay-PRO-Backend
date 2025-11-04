import Razorpay from 'razorpay';
import axios from 'axios';
import logger from '../config/logger.js';
import dotenv from 'dotenv';

dotenv.config();

class RazorpayService {
  constructor() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    // Lazily enable Razorpay only when creds exist. Never throw at import time.
    if (keyId && keySecret) {
      this.razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret
      });
      this.enabled = true;
      this.keyId = keyId;
      this.keySecret = keySecret;
    } else {
      this.razorpay = null;
      this.enabled = false;
      logger.warn('RazorpayX is not configured: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable payouts.');
    }
  }

  /**
   * Create a contact for an employee
   * @param {Object} employeeData - Employee contact information
   * @returns {Promise<Object>} Created contact
   */
  async createContact(employeeData) {
    try {
      if (!this.enabled || !this.razorpay) {
        throw new Error('RazorpayX is not configured');
      }
      const contactData = {
        name: employeeData.name,
        email: employeeData.email,
        contact: employeeData.phone || '',
        type: 'employee',
        reference_id: employeeData.employeeId || employeeData._id,
        notes: {
          employee_id: employeeData.employeeId || employeeData._id,
          department: employeeData.department || ''
        }
      };

      // Some versions of the Razorpay SDK may not expose the 'contacts' namespace
      // Fallback to direct REST call if SDK doesn't provide contacts.create
      if (this.razorpay.contacts && typeof this.razorpay.contacts.create === 'function') {
        const contact = await this.razorpay.contacts.create(contactData);
        logger.info(`Razorpay contact created for employee: ${employeeData.name}`, { contactId: contact.id });
        return contact;
      }

      // Fallback: use axios to call Razorpay REST API directly
      const resp = await axios.post(
        'https://api.razorpay.com/v1/contacts',
        contactData,
        {
          auth: { username: this.keyId, password: this.keySecret },
          headers: { 'Content-Type': 'application/json' }
        }
      );
      logger.info(`Razorpay contact created (REST) for employee: ${employeeData.name}`, { contactId: resp.data.id });
      return resp.data;
    } catch (error) {
      logger.error('Failed to create Razorpay contact:', error?.response?.data || error.message || error);
      throw new Error(`Razorpay contact creation failed: ${error?.response?.data?.error || error.message}`);
    }
  }

  /**
   * Create a fund account for bank account
   * @param {string} contactId - Razorpay contact ID
   * @param {Object} bankDetails - Bank account information
   * @returns {Promise<Object>} Created fund account
   */
  async createBankAccount(contactId, bankDetails) {
    try {
      if (!this.enabled || !this.razorpay) {
        throw new Error('RazorpayX is not configured');
      }
      const fundAccountData = {
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: {
          name: bankDetails.accountHolderName,
          ifsc: bankDetails.ifsc,
          account_number: bankDetails.accountNumber
        }
      };

      if (this.razorpay.fundAccount && typeof this.razorpay.fundAccount.create === 'function') {
        const fundAccount = await this.razorpay.fundAccount.create(fundAccountData);
        logger.info(`Bank fund account created for contact: ${contactId}`, { fundAccountId: fundAccount.id });
        return fundAccount;
      }

      const resp = await axios.post(
        'https://api.razorpay.com/v1/fund_accounts',
        fundAccountData,
        {
          auth: { username: this.keyId, password: this.keySecret },
          headers: { 'Content-Type': 'application/json' }
        }
      );
      logger.info(`Bank fund account created (REST) for contact: ${contactId}`, { fundAccountId: resp.data.id });
      return resp.data;
    } catch (error) {
      logger.error('Failed to create bank fund account:', error?.response?.data || error.message || error);
      throw new Error(`Bank fund account creation failed: ${error?.response?.data?.error || error.message}`);
    }
  }

  /**
   * Create a fund account for UPI
   * @param {string} contactId - Razorpay contact ID
   * @param {Object} upiDetails - UPI information
   * @returns {Promise<Object>} Created fund account
   */
  async createUpiAccount(contactId, upiDetails) {
    try {
      if (!this.enabled || !this.razorpay) {
        throw new Error('RazorpayX is not configured');
      }
      const fundAccountData = {
        contact_id: contactId,
        account_type: 'vpa',
        vpa: {
          address: upiDetails.upiId
        }
      };

      if (this.razorpay.fundAccount && typeof this.razorpay.fundAccount.create === 'function') {
        const fundAccount = await this.razorpay.fundAccount.create(fundAccountData);
        logger.info(`UPI fund account created for contact: ${contactId}`, { fundAccountId: fundAccount.id });
        return fundAccount;
      }

      const resp = await axios.post(
        'https://api.razorpay.com/v1/fund_accounts',
        fundAccountData,
        {
          auth: { username: this.keyId, password: this.keySecret },
          headers: { 'Content-Type': 'application/json' }
        }
      );
      logger.info(`UPI fund account created (REST) for contact: ${contactId}`, { fundAccountId: resp.data.id });
      return resp.data;
    } catch (error) {
      logger.error('Failed to create UPI fund account:', error?.response?.data || error.message || error);
      throw new Error(`UPI fund account creation failed: ${error?.response?.data?.error || error.message}`);
    }
  }

  /**
   * Initiate a payout
   * @param {Object} payoutData - Payout information
   * @returns {Promise<Object>} Payout response
   */
  async initiatePayout(payoutData) {
    try {
      if (!this.enabled || !this.razorpay) {
        throw new Error('RazorpayX is not configured');
      }
      const payout = {
        account_number: process.env.RAZORPAY_ACCOUNT_NUMBER, // Your RazorpayX account number
        fund_account_id: payoutData.fundAccountId,
        amount: Math.round(payoutData.amount * 100), // Amount in paise
        currency: 'INR',
        mode: payoutData.mode || 'IMPS', // IMPS, NEFT, RTGS, UPI
        purpose: 'salary',
        queue_if_low_balance: true,
        reference_id: payoutData.referenceId,
        narration: payoutData.narration || 'Salary payout',
        notes: payoutData.notes || {}
      };

      // Use SDK if available
      if (this.razorpay.payouts && typeof this.razorpay.payouts.create === 'function') {
        const payoutResponse = await this.razorpay.payouts.create(payout);
        logger.info(`Payout initiated: ${payoutResponse.id}`, {
          amount: payoutData.amount,
          fundAccountId: payoutData.fundAccountId
        });
        return payoutResponse;
      }

      // Fallback to REST
      const resp = await axios.post(
        'https://api.razorpay.com/v1/payouts',
        payout,
        { auth: { username: this.keyId, password: this.keySecret }, headers: { 'Content-Type': 'application/json' } }
      );
      logger.info(`Payout initiated (REST): ${resp.data.id}`, {
        amount: payoutData.amount,
        fundAccountId: payoutData.fundAccountId
      });
      return resp.data;
    } catch (error) {
      logger.error('Failed to initiate payout:', error?.response?.data || error.message || error);
      throw new Error(`Payout initiation failed: ${error?.response?.data?.error || error.message}`);
    }
  }

  /**
   * Get payout status
   * @param {string} payoutId - Razorpay payout ID
   * @returns {Promise<Object>} Payout status
   */
  async getPayoutStatus(payoutId) {
    try {
      if (!this.enabled || !this.razorpay) {
        throw new Error('RazorpayX is not configured');
      }
      if (this.razorpay.payouts && typeof this.razorpay.payouts.fetch === 'function') {
        const payout = await this.razorpay.payouts.fetch(payoutId);
        return payout;
      }

      const resp = await axios.get(
        `https://api.razorpay.com/v1/payouts/${payoutId}`,
        { auth: { username: this.keyId, password: this.keySecret } }
      );
      return resp.data;
    } catch (error) {
      logger.error('Failed to fetch payout status:', error?.response?.data || error.message || error);
      throw new Error(`Failed to fetch payout status: ${error?.response?.data?.error || error.message}`);
    }
  }

  /**
   * Get account balance
   * @returns {Promise<Object>} Account balance
   */
  async getAccountBalance() {
    try {
      if (!this.enabled || !this.razorpay) {
        throw new Error('RazorpayX is not configured');
      }
      const accountNumber = process.env.RAZORPAY_ACCOUNT_NUMBER;
      if (!accountNumber) {
        throw new Error('RAZORPAY_ACCOUNT_NUMBER is not set');
      }

      // Use SDK if available
      if (this.razorpay.accounts && typeof this.razorpay.accounts.fetch === 'function') {
        const balance = await this.razorpay.accounts.fetch(accountNumber);
        return balance;
      }

      // Fallback to REST
      const resp = await axios.get(
        `https://api.razorpay.com/v1/accounts/${accountNumber}`,
        {
          auth: { username: this.keyId, password: this.keySecret }
        }
      );
      return resp.data;
    } catch (error) {
      logger.error('Failed to fetch account balance:', error?.response?.data || error.message || error);
      throw new Error(`Failed to fetch account balance: ${error?.response?.data?.error || error.message}`);
    }
  }

  /**
   * Bulk payout creation
   * @param {Array} payouts - Array of payout objects
   * @returns {Promise<Array>} Array of payout responses
   */
  async createBulkPayouts(payouts) {
    try {
      if (!this.enabled || !this.razorpay) {
        throw new Error('RazorpayX is not configured');
      }
      const payoutPromises = payouts.map(payout => this.initiatePayout(payout));
      const results = await Promise.allSettled(payoutPromises);
      
      const successful = results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
        
      const failed = results
        .filter(result => result.status === 'rejected')
        .map(result => ({ error: result.reason.message }));

      logger.info(`Bulk payout completed`, { 
        successful: successful.length, 
        failed: failed.length 
      });

      return { successful, failed };
    } catch (error) {
      logger.error('Bulk payout failed:', error);
      throw new Error(`Bulk payout failed: ${error.message}`);
    }
  }
}

export default new RazorpayService();