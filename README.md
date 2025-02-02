# Historical Currency Convertor App

A Node.js application for converting currencies in CSV files.

## Setup

1. Clone the repository: `git clone https://github.com/your-repo/currency-conversion-app.git`
2. Navigate to the project directory: `cd currency-conversion-app`
3. Install dependencies: `npm install`
4. Create a `.env` file based on `.env.example` and set your API key
5. Run the server: `node app.js`

## Environment Variables

- `USE_MOCK_DATA`: Set to 'true' to use mock exchange rates, 'false' to use the API
- `EXCHANGE_RATE_API_KEY`: Your API key from exchangerate-api.com

## Usage

1. Access the application at `http://localhost:3000`
2. Upload a CSV file with 'date' and 'amount' columns
3. Enter the source and target currencies
4. Download the converted CSV file
