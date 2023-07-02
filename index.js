const Web3 = require('web3');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { PubSub } = require('@google-cloud/pubsub');

console.log('project id:', process.env.PROJECT_ID);

const pubsub = new PubSub({ projectId: process.env.PROJECT_ID });

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
    console.log('Smart contract ABI published to Pub/Sub topic');
  } catch (error) {
    console.error('Error publishing smart contract ABI:', error);
  }
}

async function retrieveSmartContractABI(web3, blockNumber) {
  try {
    const block = await web3.eth.getBlock(blockNumber);
    const contractABIs = [];

    for (const txHash of block.transactions) {
      const tx = await web3.eth.getTransaction(txHash);
      if (tx.to) {
        const code = await web3.eth.getCode(tx.to);
        if (code !== '0x') {
          const contract = new web3.eth.Contract(JSON.parse(code), tx.to);
          const contractABI = contract.options.jsonInterface;
          contractABIs.push(contractABI);
        }
      }
    }

    if (contractABIs.length > 0) {
      await publishSmartContractABI(contractABIs);
    }
  } catch (error) {
    console.error('Error retrieving smart contract ABI:', error);
  }
}

async function processBlockNumbers(blockNumbers) {
  try {
    const apiKey = await getApiKey();
    const web3 = new Web3(`https://mainnet.infura.io/v3/${apiKey}`);

    for (const blockNumber of blockNumbers) {
      console.log('Processing block number:', blockNumber);
      await retrieveSmartContractABI(web3, blockNumber);
    }
  } catch (error) {
    console.error('Error processing block numbers:', error);
  }
}

async function retrieveBlockNumbers() {
  try {
    const subscriptionName = 'latest-blocknumber-subscription';
    const [response] = await pubsub.subscription(subscriptionName).pull({ maxMessages: 1 });

    if (response.length > 0) {
      const message = response[0];
      const blockNumbers = JSON.parse(message.data.toString()).blockNumbers;

      await processBlockNumbers(blockNumbers);

      await pubsub.subscription(subscriptionName).acknowledge([message.ackId]);
    } else {
      console.log('No messages received from Pub/Sub subscription');
    }
  } catch (error) {
    console.error('Error retrieving block numbers:', error);
  }
}

async function main() {
  try {
    while (true) {
      await retrieveBlockNumbers();
    }
  } catch (error) {
    console.error('Error in main loop:', error);
  }
}

main();
