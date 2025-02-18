const express = require('express');
const multer = require('multer');
const { default: DocumentIntelligence, getLongRunningPoller, isUnexpected } = require('@azure-rest/ai-document-intelligence');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const port = 8000;

const endpoint = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
const key = process.env.DOCUMENT_INTELLIGENCE_API_KEY;
const model_id = process.env.CUSTOM_CLASSIFIER_ID;

const client = DocumentIntelligence(endpoint, { key });

app.use(express.json());

const upload = multer({ dest: 'uploads/' });

app.post('/classify/file', upload.single('document'), async (req, res) => {
    const file = req.file;

    if (!file) {
        return res.status(400).send('Document file is required');
    }

    const filePath = path.join(__dirname, file.path);

    try {
        const fileBuffer = fs.readFileSync(filePath);

        const initialResponse = await client
            .path("/documentClassifiers/{classifierId}:analyze", model_id)
            .post({
                contentType: "application/octet-stream",
                body: fileBuffer,
            });

        if (isUnexpected(initialResponse)) {
            throw initialResponse.body.error;
        }

        const poller = getLongRunningPoller(client, initialResponse);
        const analyzeResult = ((await poller.pollUntilDone()).body).analyzeResult;

        if (analyzeResult?.documents === undefined || analyzeResult.documents.length === 0) {
            return res.status(500).send('Failed to extract any documents.');
        }

        res.json(analyzeResult.documents);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error classifying document');
    } finally {
        fs.unlinkSync(filePath); // Clean up the uploaded file
    }
});

app.post('/classify/url', async (req, res) => {
    const { documentUrl } = req.body;

    if (!documentUrl) {
        return res.status(400).send('Document URL is required');
    }

    try {
        const response = await axios.get(documentUrl, { responseType: 'arraybuffer' });
        const fileBuffer = response.data;

        const initialResponse = await client
            .path("/documentClassifiers/{classifierId}:analyze", model_id)
            .post({
                contentType: "application/octet-stream",
                body: fileBuffer,
            });

        if (isUnexpected(initialResponse)) {
            throw initialResponse.body.error;
        }

        const poller = getLongRunningPoller(client, initialResponse);
        const analyzeResult = ((await poller.pollUntilDone()).body).analyzeResult;

        if (analyzeResult?.documents === undefined || analyzeResult.documents.length === 0) {
            return res.status(500).send('Failed to extract any documents.');
        }

        res.json(analyzeResult.documents);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error classifying document');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});