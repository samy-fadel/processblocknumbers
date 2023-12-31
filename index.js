const Web3 = require('web3');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { v1 } = require('@google-cloud/pubsub');

console.log('line 5 project id:', process.env.PROJECT_ID);

const client = new v1.SubscriberClient();

async function getApiKey() {
  const secretName = `projects/${process.env.PROJECT_NUMBER}/secrets/web3-api-key/versions/latest`;
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({ name: secretName });
  return version.payload.data.toString();
}

async function publishSmartContractABI(contractABI) {
  try {
    const topicName = 'smartcontract-topic';
    const data = Buffer.from(JSON.stringify(contractABI));
    await pubsub.topic(topicName).publish(data);
    console.log('line 21 Smart contract ABI published to Pub/Sub topic');
  } catch (error) {
    console.error('line 23 Error publishing smart contract ABI:', error);
  }
}

async function retrieveSmartContractABI(web3, blockNumber) {
  try {
    const block = await web3.eth.getBlock(blockNumber);
    const contractABIs = [];

    console.log("line 32", block, "end line 32");

    for (const txHash of block.transactions) {
      const tx = await web3.eth.getTransaction(txHash);
      console.log("line 36 ", tx.to);
      if (!tx.to) { // Check if tx.to is null (contract creation transaction)
        console.log("line 37 inside if tx.to", tx.to);
        const code = await web3.eth.getCode(tx.to);
        console.log("line 38", code);
        if (code.startsWith('0x') && code !== '0x') { // Add this check
          console.log("line 41");
         // const contract = new web3.eth.Contract(JSON.parse(code), tx.to);
         const contract = new web3.eth.Contract(code, txHash.to);
          const contractABI = contract.options.jsonInterface;
          console.log("line 42 ", contractABI);
          contractABIs.push(contractABI);
        }
      } else console.log("tx.to not null then no smart contract");
    }

    if (contractABIs.length > 0) {
      await publishSmartContractABI(contractABIs);
    }
  } catch (error) {
  console.error('line 54 Error retrieving smart contract ABI:', error);
  console.error(error.stack);  }
}

async function retrieveBlockNumbers() {
  try {
    const processBlockNumbers = async (blockNumbers) => {
      try {
        const apiKey = await getApiKey();
        const web3 = new Web3(`https://mainnet.infura.io/v3/${apiKey}`);

        if (Array.isArray(blockNumbers)) {
          for (const blockNumber of blockNumbers) {
            console.log('line 64 Processing block number:', blockNumber);
            await retrieveSmartContractABI(web3, blockNumber);
          }
        } else {
          console.log('line 68 Processing single block number:', blockNumbers);
          await retrieveSmartContractABI(web3, blockNumbers);
        }
      } catch (error) {
        console.error('line 72 Error processing block numbers:', error);
      }
    };

    const subscriptionName = 'latest-blocknumber-topic-sub';
    const request = {
      subscription: client.subscriptionPath(process.env.PROJECT_ID, subscriptionName),
      maxMessages: 1,
    };

    const [response] = await client.pull(request);
    const messages = response.receivedMessages;

    if (messages && messages.length > 0) {
      const message = messages[0].message;
      const messageData = message.data.toString();
      console.log('line 88 Received message data:', messageData);
      const blockNumber = JSON.parse(messageData).blockNumber;

      await processBlockNumbers([blockNumber]); // Wrap the block number in an array

      const ackRequest = {
        subscription: request.subscription,
        ackIds: [messages[0].ackId],
      };

      await client.acknowledge(ackRequest);
    } else {
      console.log('line 100 No messages received from Pub/Sub subscription');
    }
  } catch (error) {
    console.error('line 103 Error retrieving block numbers:', error);
  }
}

retrieveBlockNumbers();