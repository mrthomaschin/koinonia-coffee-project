import React from 'react';

export class FlashquotesEmbed extends React.Component {
  private readonly iframeContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            margin: 0; 
            padding: 20px; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
        </style>
      </head>
      <body>
        <script form-id="cmmbfjpjh0001jr045oua4csa" src="https://app.flashquotes.com/embed.js"></script>
      </body>
    </html>
  `;

  render() {
    return (
      <iframe
        srcDoc={this.iframeContent}
        style={{
          width: '100%',
          height: '80vh',
          border: 'none',
          borderRadius: '8px'
        }}
        title="Flashquotes Form"
      />
    );
  }
}