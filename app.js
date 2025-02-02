require('dotenv').config();
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { Parser } = require('json2csv');
const path = require('path');

const { getExchangeRate } = require('./exchangeRateService');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.post('/convert', upload.single('csv_file'), async (req, res) => {
    const { baseCurrency, targetCurrency } = req.body;

    let processingStats = {
        totalRows: 0,
        successfulConversions: 0,
        failedConversions: 0,
        details: []
    };

    const processFile = new Promise((resolve, reject) => {
        const rows = [];
        console.log('Starting to read CSV file...');

        fs.createReadStream(req.file.path)
            .pipe(csv({
                separator: ';',
                mapValues: ({ header, value }) => value.trim()
            }))
            .on('data', (row) => {
                console.log('Read row:', row);
                rows.push(row);
            })
            .on('end', () => {
                console.log(`Finished reading CSV. Found ${rows.length} rows.`);
                resolve(rows);
            })
            .on('error', (error) => {
                console.error('Error reading CSV:', error);
                reject(error);
            });
    });

    try {
        const rows = await processFile;

        // Validate required columns exist
        const firstRow = rows[0];
        const requiredColumns = ['date', 'amount'];
        const missingColumns = requiredColumns.filter(col =>
            !Object.keys(firstRow).some(key =>
                key.toLowerCase() === col.toLowerCase()
            )
        );

        if (missingColumns.length > 0) {
            throw new Error(
                `Required columns missing in CSV: ${missingColumns.join(', ')}. ` +
                `Please ensure your CSV has columns named 'date' and 'amount' (case insensitive).`
            );
        }

        processingStats.totalRows = rows.length;

        const processedResults = await Promise.all(
            rows.map(async (row, index) => {
                try {
                    let convertedAmount = '';
                    let exchangeRate = '';
                    let status = 'failed';
                    let message = '';

                    if (row.date && row.amount) {
                        const dateStr = row.date.trim();
                        let formattedDate;

                        // Helper function to validate date parts
                        const isValidDate = (day, month, year) => {
                            // Check if numbers are in valid ranges
                            const d = parseInt(day, 10);
                            const m = parseInt(month, 10);
                            const y = parseInt(year, 10);

                            return d > 0 && d <= 31 && m > 0 && m <= 12;
                        };

                        try {
                            if (dateStr.includes('-')) {
                                // Already in YYYY-MM-DD format
                                formattedDate = dateStr;
                            } else if (dateStr.includes('.') || dateStr.includes('/')) {
                                // DD.MM.YY or DD/MM/YY format
                                const parts = dateStr.split(/[./]/); // Split on either . or /
                                const [day, month, year] = parts;

                                if (parts.length === 3 && isValidDate(day, month, year)) {
                                    // Ensure year is four digits
                                    const fullYear = year.length === 2 ? '20' + year : year;
                                    formattedDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                                } else {
                                    throw new Error(`Invalid date parts: ${dateStr}`);
                                }
                            } else {
                                throw new Error(`Unsupported date format: ${dateStr}`);
                            }

                            // Validate the resulting date
                            const testDate = new Date(formattedDate);
                            if (isNaN(testDate.getTime())) {
                                throw new Error(`Invalid date: ${formattedDate}`);
                            }

                            console.log(`Parsed date ${dateStr} to ${formattedDate}`);

                            // Parse amount handling both comma and dot as decimal separators
                            const parseAmount = (amountStr) => {
                                // Remove any thousand separators and normalize decimal separator
                                let normalized = amountStr.trim();

                                // Check if the number uses comma as decimal separator
                                if (normalized.includes(',')) {
                                    // If there's a dot before the comma, it's using dot as thousand separator
                                    if (normalized.indexOf('.') < normalized.indexOf(',')) {
                                        normalized = normalized.replace(/\./g, '').replace(',', '.');
                                    } else {
                                        normalized = normalized.replace(',', '.');
                                    }
                                }

                                return parseFloat(normalized);
                            };

                            const amount = parseAmount(row.amount);

                            if (isNaN(amount)) {
                                message = `Invalid amount format: ${row.amount}`;
                                console.warn(message);
                            } else {
                                if (!isNaN(amount) && formattedDate) {
                                    const rate = await getExchangeRate(formattedDate, baseCurrency, targetCurrency);
                                    if (rate) {
                                        convertedAmount = (amount * rate).toFixed(2).replace('.', ',');
                                        exchangeRate = rate.toFixed(4).replace('.', ',');
                                        status = 'success';
                                        processingStats.successfulConversions++;
                                    } else {
                                        processingStats.failedConversions++;
                                    }
                                } else {
                                    processingStats.failedConversions++;
                                }
                            }
                        } catch (error) {
                            processingStats.failedConversions++;
                            processingStats.details.push({
                                rowNumber: index + 1,
                                status: 'error',
                                message: error.message
                            });
                            return {
                                ...row,
                                converted_amount: '',
                                exchange_rate: ''
                            };
                        }

                        // Store processing details
                        processingStats.details.push({
                            rowNumber: index + 1,
                            status,
                            message
                        });

                        return {
                            ...row,
                            converted_amount: convertedAmount,
                            exchange_rate: exchangeRate
                        };
                    } else {
                        processingStats.failedConversions++;
                    }
                } catch (error) {
                    processingStats.failedConversions++;
                    return {
                        ...row,
                        converted_amount: '',
                        exchange_rate: ''
                    };
                }
            })
        );

        // Check if all conversions failed
        if (processingStats.successfulConversions === 0) {
            throw new Error(
                'No rows were successfully converted. ' +
                'Please check your CSV format and ensure date and amount values are valid.'
            );
        }

        // Get all original fields from the first row
        const originalFields = Object.keys(rows[0] || {});
        const conversionFields = ['converted_amount', 'exchange_rate'];
        const fields = [...originalFields, ...conversionFields];

        const csvParser = new Parser({
            fields,
            delimiter: ';'
        });

        // Use the processed results directly since they already contain the conversion fields
        const outputCsv = csvParser.parse(processedResults);
        const outputFilePath = path.join(__dirname, 'output.csv');
        fs.writeFileSync(outputFilePath, outputCsv);

        console.log(`Conversion Summary: ${processingStats.successfulConversions}/${processingStats.totalRows} rows converted from ${baseCurrency} to ${targetCurrency}`);

        res.json({
            success: true,
            stats: processingStats,
            message: 'File processed successfully'
        });

    } catch (error) {
        console.error('Conversion failed:', error.message);
        res.status(400).json({
            success: false,
            type: 'VALIDATION_ERROR',
            message: error.message
        });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Add a new route for downloading
app.get('/download-converted-csv', (req, res) => {
    const outputFilePath = path.join(__dirname, 'output.csv');
    res.download(outputFilePath, 'converted_currency.csv', (err) => {
        if (err) {
            console.error('Error sending file:', err);
        }
        // Clean up files after sending
        fs.unlinkSync(outputFilePath);
    });
});

const port = process.env.PORT || 3000;
app.listen(port)
    .on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is busy, trying ${port + 1}...`);
            app.listen(port + 1);
        } else {
            console.error('Server error:', err);
        }
    })
    .on('listening', () => {
        console.log(`Server running on port ${port}`);
    });
