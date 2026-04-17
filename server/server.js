const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const databaseId = process.env.NOTION_DATABASE_ID;

app.post('/api/contact', async (req, res) => {
  const { firstName, lastName, phone, email, message } = req.body;

  if (!firstName || !lastName || !phone || !email || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    await notion.pages.create({
      parent: {
        database_id: databaseId,
      },
      properties: {
        'First Name': {
          title: [
            {
              text: {
                content: firstName,
              },
            },
          ],
        },
        'Last Name': {
          rich_text: [
            {
              text: {
                content: lastName,
              },
            },
          ],
        },
        'Phone': {
          phone_number: phone,
        },
        'Email': {
          email: email,
        },
        'Message': {
          rich_text: [
            {
              text: {
                content: message,
              },
            },
          ],
        },
      },
    });

    res.status(200).json({ success: true, message: 'Contact form submitted successfully' });
  } catch (error) {
    console.error('Error submitting to Notion:', error);
    res.status(500).json({ error: 'Failed to submit form', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
