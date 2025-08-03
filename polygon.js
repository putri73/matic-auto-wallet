// autoMATIC.js
import { ethers } from "ethers";

// Ganti dengan PRIVATE KEY wallet kamu
const PRIVATE_KEY = "0x769efceae0d86801798b4c69e0cfd2af80e398f09e07134e5139ada9d80819d1";
const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor.publicnode.com");
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const ADDRESS = wallet.address.toLowerCase();

let lastBalance = ethers.BigNumber.from("0");
let lastSelfSentAt = Date.now();
let lastIncomingTimestamp = Date.now();
let isSending = false;
let isPendingAutoSend = false;

async function sendToSelf() {
  try {
    const gasPrice = await provider.getGasPrice();
    const gasLimit = 22000;
    const valueToSend = ethers.utils.parseEther("0.05");
    const gasFee = gasPrice.mul(gasLimit);
    const minRequired = valueToSend.add(gasFee);
    const balance = await wallet.getBalance();

    if (balance.lt(minRequired)) {
      console.log("❌ Tidak cukup saldo untuk kirim.");
      return;
    }

    isSending = true;
    console.log(`🚀 Mengirim 0.05 MATIC ke diri sendiri...`);

    const tx = await wallet.sendTransaction({
      to: ADDRESS,
      value: valueToSend,
      gasPrice,
      gasLimit,
      nonce: await provider.getTransactionCount(ADDRESS, "latest"),
      data: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("auto reward")),
    });

    await tx.wait();
    console.log("✅ Transaksi sukses:", tx.hash);

    lastSelfSentAt = Date.now();
    lastIncomingTimestamp = Date.now();
  } catch (err) {
    console.error("❌ Gagal kirim:", err.message);
  } finally {
    isSending = false;
    isPendingAutoSend = false;
  }
}

async function monitor() {
  setInterval(async () => {
    try {
      const latestBalance = await provider.getBalance(ADDRESS);
      const delta = latestBalance.sub(lastBalance);

      if (
        delta.gt(ethers.utils.parseEther("0.049")) && // transfer masuk ≥ 0.05 MATIC
        !isSending &&
        !isPendingAutoSend
      ) {
        const latestBlock = await provider.getBlock("latest");
        const txs = await Promise.all(
          latestBlock.transactions.map(txHash => provider.getTransaction(txHash))
        );

        const incomingTx = txs.find(tx =>
          tx.to?.toLowerCase() === ADDRESS &&
          tx.from?.toLowerCase() !== ADDRESS &&
          ethers.BigNumber.from(tx.value).gt(ethers.utils.parseEther("0.049"))
        );

        if (incomingTx) {
          console.log(`📥 Transfer masuk dari ${incomingTx.from}. Auto-send dijadwalkan.`);
          isPendingAutoSend = true;
          lastIncomingTimestamp = Date.now();

          setTimeout(async () => {
            if (!isSending) {
              await sendToSelf();
              lastBalance = await provider.getBalance(ADDRESS);
            }
          }, 30000); // tunggu 30 detik
        }
      }

      lastBalance = latestBalance;
    } catch (e) {
      console.error("⚠️ Gagal memantau:", e.message);
    }
  }, 5000);
}

function checkInactivity() {
  setInterval(async () => {
    const now = Date.now();
    const noTransferFor = now - lastIncomingTimestamp;

    if (noTransferFor >= 240000 && !isSending) {
      const balance = await wallet.getBalance();
      const gasPrice = await provider.getGasPrice();
      const gasLimit = 22000;
      const valueToSend = ethers.utils.parseEther("0.05");
      const minRequired = valueToSend.add(gasPrice.mul(gasLimit));

      if (balance.gte(minRequired)) {
        console.log("⏰ Tidak ada transfer masuk selama 4 menit. Kirim ke diri sendiri...");
        await sendToSelf();
      }
    }
  }, 10000);
}

(async () => {
  lastBalance = await provider.getBalance(ADDRESS);
  console.log("🔄 Monitoring aktif. Alamat wallet:", ADDRESS);
  monitor();
  checkInactivity();
})();
