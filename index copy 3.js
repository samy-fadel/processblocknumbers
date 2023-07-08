const Web3 = require('web3');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { v1 } = require('@google-cloud/pubsub');

console.log('project id:', process.env.PROJECT_ID);

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

    console.log("line 32 ", block);

    for (const txHash of block.transactions) {
      const tx = await web3.eth.getTransaction(txHash);
      if (tx.to) {
        const code = await web3.eth.getCode(tx.to);
        console.log("line 38 ", code);
        if (code.startsWith('0x') && code !== '0x') {
          const contract = new web3.eth.Contract(code, tx.to);
          const contractABI = contract.options.jsonInterface;
          console.log("line 42 ", contractABI);
          contractABIs.push(contractABI);
        }
      }
    }

    if (contractABIs.length > 0) {
      await publishSmartContractABI(contractABIs);
    }
  } catch (error) {
    console.error('line 52 Error retrieving smart contract ABI:', error);
    console.error("line 53 ", error.stack);
  }
}

async function retrieveBlockNumbers() {
  try {
    const processBlockNumbers = async (blockNumbers) => {
      try {
        const apiKey = await getApiKey();
        const web3 = new Web3(`https://mainnet.infura.io/v3/${apiKey}`);

        if (Array.isArray(blockNumbers)) {
          for (const blockNumber of blockNumbers) {
            console.log('line 66 Processing block number:', blockNumber);
            await retrieveSmartContractABI(web3, blockNumber);
          }
        } else {
          console.log('line 70 Processing single block number:', blockNumbers);
          await retrieveSmartContractABI(web3, blockNumbers);
        }
      } catch (error) {
        console.error('line 74 Error processing block numbers:', error);
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
      console.log('line 90 Received message data:', messageData);
      const blockNumber = JSON.parse(messageData).blockNumber;

      await processBlockNumbers([blockNumber]);

      const ackRequest = {
        subscription: request.subscription,
        ackIds: [messages[0].ackId],
      };

      await client.acknowledge(ackRequest);
    } else {
      console.log('line 102 No messages received from Pub/Sub subscription');
    }
  } catch (error) {
    console.error('line 105 Error retrieving block numbers:', error);
  }
}

retrieveBlockNumbers();