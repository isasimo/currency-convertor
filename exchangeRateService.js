// exchangeRateService.js
const axios = require('axios');

// Mock exchange rates for testing
const mockRates = {
    'EUR': { 'CHF': 0.97, 'USD': 1.08 },
    'CHF': { 'EUR': 1.03, 'USD': 1.12 },
    'USD': { 'EUR': 0.93, 'CHF': 0.89 }
};

// Function to get exchange rate using mock data
function getExchangeRateFromMock(date, baseCurrency, targetCurrency) {
    return mockRates[baseCurrency]?.[targetCurrency] || null;
}

// Function to get exchange rate from API
async function getExchangeRateFromApi(date, baseCurrency, targetCurrency) {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;

    if (!apiKey) {
        throw new Error('Exchange rate API key not configured in .env file');
    }

    const [year, month, day] = date.split('-');
    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/history/${baseCurrency}/${year}/${month}/${day}`;

    try {
        const response = await axios.get(url);
        if (response.data && response.data.conversion_rates) {
            return response.data.conversion_rates[targetCurrency];
        }
        throw new Error('No conversion rates found in API response');
    } catch (error) {
        throw new Error(`API request failed: ${error.message}`);
    }
}

// Function to decide which implementation to use
async function getExchangeRate(date, baseCurrency, targetCurrency) {
    if (!date || !baseCurrency || !targetCurrency) {
        throw new Error('Missing required parameters: date, baseCurrency, or targetCurrency');
    }

    baseCurrency = baseCurrency.toUpperCase();
    targetCurrency = targetCurrency.toUpperCase();

    if (process.env.USE_MOCK_DATA === 'true') {
        return getExchangeRateFromMock(date, baseCurrency, targetCurrency);
    }

    try {
        return await getExchangeRateFromApi(date, baseCurrency, targetCurrency);
    } catch (error) {
        console.error('API Error:', error.message);
        return getExchangeRateFromMock(date, baseCurrency, targetCurrency);
    }
}

module.exports = { getExchangeRate };
