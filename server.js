const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------
// ১. ইন-মেমোরি ডাটাবেজ (টেস্টিং এর জন্য ডাটা স্ট্রাকচার)
// ---------------------------------------------------------
let agencies = {
    "agency_01": { id: "agency_01", name: "Alpha Marketing", balance: 500 } // শুরুতে $500 ডিপোজিট আছে
};

let users = {
    "user_01": { id: "user_01", name: "Fahad Mia", balance: 0, isVerified: true, badges: ["Verified Expert"] }
};

let platformStats = {
    companyEarnedFees: 0 // আপনার কোম্পানির কেটে নেওয়া ফি এখানে জমা হবে
};

let tasks = [];

// কোম্পানি ফি এর পারসেন্টেজ নির্ধারণ (যেমন: এজেন্সি থেকে ৫%, ইউজার থেকে ৫%)
const AGENCY_FEE_PERCENT = 0.05;
const USER_FEE_PERCENT = 0.05;

// ---------------------------------------------------------
// ২. ব্যাকএন্ড লজিক এবং এপিআই (Business Workflow)
// ---------------------------------------------------------

// [এজেন্সি] টাস্ক বা কাজ আপলোড করা
app.post('/api/tasks/upload', (req, res) => {
    const { agencyId, title, budget, description } = req.body;
    const agency = agencies[agencyId];

    if (!agency) return res.status(404).json({ error: "Agency not found" });
    if (agency.balance < budget) return res.status(400).json({ error: "Insufficient balance to host this task!" });

    // টাস্ক ক্রিয়েট করা (শুরুতে ওপেন থাকবে)
    const newTask = {
        id: "task_" + (tasks.length + 1),
        agencyId,
        title,
        description,
        budget: Number(budget),
        status: "OPEN", // OPEN -> CLAIMED -> LOCKED_IN_ESCROW -> COMPLETED
        claimedBy: null,
        escrowAmount: 0
    };

    tasks.push(newTask);
    res.json({ message: "Task uploaded successfully!", task: newTask });
});

// [ইউজার] টাস্ক ক্লেইম করা (অবশ্যই ভেরিফাইড হতে হবে)
app.post('/api/tasks/claim', (req, res) => {
    const { taskId, userId } = req.body;
    const user = users[userId];
    const task = tasks.find(t => t.id === taskId);

    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.isVerified) return res.status(403).json({ error: "Please verify your account to claim tasks." });
    if (task.status !== "OPEN") return res.status(400).json({ error: "Task is no longer open." });

    task.status = "CLAIMED";
    task.claimedBy = userId;

    res.json({ message: "Task claimed! Agency will now interview you.", task });
});

// [এজেন্সি] ইন্টারভিউ শেষে ফাইনাল করা এবং ফান্ড এসক্রো-তে লক করা
app.post('/api/tasks/lock-final', (req, res) => {
    const { taskId, agencyId } = req.body;
    const task = tasks.find(t => t.id === taskId);
    const agency = agencies[agencyId];

    if (!task || task.agencyId !== agencyId) return res.status(400).json({ error: "Invalid request" });
    if (task.status !== "CLAIMED") return res.status(400).json({ error: "Task must be claimed first." });

    // এজেন্সির ব্যালেন্স কেটে ওয়েটিং/এসক্রো তে রাখা
    agency.balance -= task.budget;
    task.escrowAmount = task.budget;
    task.status = "LOCKED_IN_ESCROW";

    res.json({ 
        message: "Interview successful! Budget is locked in Escrow. User can now start working.", 
        task, 
        agencyRemainingBalance: agency.balance 
    });
});

// [অ্যাডমিন প্যানেল] দুই পক্ষের কনফার্মেশন নিয়ে কাজ এন্ড করা এবং ফি কেটে পেমেন্ট রিলিজ করা
app.post('/api/admin/release-payment', (req, res) => {
    const { taskId, agencyConfirmation, userConfirmation } = req.body;
    const task = tasks.find(t => t.id === taskId);

    if (!task || task.status !== "LOCKED_IN_ESCROW") return res.status(400).json({ error: "Task is not in escrow status." });
    if (!agencyConfirmation || !userConfirmation) return res.status(400).json({ error: "Confirmation required from both sides." });

    const totalBudget = task.escrowAmount;
    
    // ফি ক্যালকুলেশন
    const agencyFee = totalBudget * AGENCY_FEE_PERCENT;
    const userFee = totalBudget * USER_FEE_PERCENT;
    const totalCompanyProfit = agencyFee + userFee;

    // ইউজার যা পাবে (টোটাল বাজেট থেকে ইউজারের ফি মাইনাস)
    const userPayout = totalBudget - userFee;

    // ব্যালেন্স ডিস্ট্রিবিউশন
    const user = users[task.claimedBy];
    user.balance += userPayout;
    platformStats.companyEarnedFees += totalCompanyProfit;

    // টাস্ক ক্লোজ করা
    task.status = "COMPLETED";
    task.escrowAmount = 0;

    res.json({
        message: "Payment successfully released by Admin!",
        taskStatus: task.status,
        companyProfit: `+$${totalCompanyProfit} (From Agency: ${agencyFee}, User: ${userFee})`,
        userReceived: `$${userPayout}`,
        userCurrentBalance: `$${user.balance}`
    });
});

// ডাটা দেখার জন্য রুট (Testing Route)
app.get('/api/dashboard', (req, res) => {
    res.json({ agencies, users, tasks, platformStats });
});

// ---------------------------------------------------------
// ৩. ফ্রন্টএন্ড ইন্টারফেস (HTML + CSS + JavaScript Overview)
// ---------------------------------------------------------
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="bn">
    <head>
        <meta charset="UTF-8">
        <title>Remote Job Marketplace Proto</title>
        <style>
            body { font-family: Arial, sans-serif; background-color: #f4f6f9; margin: 20px; color: #333; }
            .container { max-width: 1100px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            h1, h2, h3 { color: #2c3e50; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .card { border: 1px solid #ddd; padding: 15px; border-radius: 6px; background: #fafafa; }
            button { background: #27ae60; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; font-weight: bold; }
            button:hover { background: #219653; }
            .status { font-weight: bold; color: #e74c3c; }
            pre { background: #222; color: #00ff00; padding: 15px; border-radius: 5px; overflow-x: auto; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Remote Job Company Platform (Prototype Master)</h1>
            <p>আপনার এজেন্সির কাজের ধারা টেস্ট করার জন্য নিচের প্যানেলগুলো ব্যবহার করুন। সম্পূর্ণ লাইভ ডাটা দেখতে নিচের <strong>Live Database</strong> সেকশন রিফ্রেশ করুন।</p>
            
            <div class="grid">
                <!-- এজেন্সি সেকশন -->
                <div class="card">
                    <h2>১. এজেন্সি প্যানেল (Alpha Marketing)</h2>
                    <p><strong>ডিপোজিট ব্যালেন্স:</strong> $500</p>
                    <h4>নতুন টাস্ক আপলোড করুন:</h4>
                    <form action="/api/tasks/upload" method="POST" target="dummyframe">
                        <input type="hidden" name="agencyId" value="agency_01">
                        <input type="text" name="title" placeholder="কাজের শিরোনাম (যেমন: SEO Expert Needed)" required style="width:90%; padding:8px; margin-bottom:8px;"><br>
                        <input type="number" name="budget" placeholder="বাজেট ($)" required style="width:90%; padding:8px; margin-bottom:8px;"><br>
                        <textarea name="description" placeholder="কাজের বিবরণ..." style="width:90%; padding:8px; margin-bottom:8px;"></textarea><br>
                        <button type="submit">টাস্ক ডিপোজিট ও আপলোড করুন</button>
                    </form>
                </div>

                <!-- ইউজার সেকশন -->
                <div class="card">
                    <h2>২. ইউজার প্যানেল (Fahad Mia)</h2>
                    <p><strong>স্ট্যাটাস:</strong> <span style="color:green;">Verified Expert ✓</span></p>
                    <p>টাস্ক ক্লেইম করতে বা এজেন্সির সাথে ইন্টারভিউ লক করতে আইডি ব্যবহার করুন।</p>
                    <hr>
                    <h4>ধাপ ২: টাস্ক ক্লেইম করুন</h4>
                    <form action="/api/tasks/claim" method="POST" target="dummyframe">
                        <input type="hidden" name="userId" value="user_01">
                        <input type="text" name="taskId" placeholder="Task ID (e.g. task_1)" required style="padding:8px;">
                        <button type="submit">কাজ ক্লেইম করুন</button>
                    </form>
                    <br>
                    <h4>ধাপ ৩: ইন্টারভিউ শেষে কাজ লক করুন (Escrow)</h4>
                    <form action="/api/tasks/lock-final" method="POST" target="dummyframe">
                        <input type="hidden" name="agencyId" value="agency_01">
                        <input type="text" name="taskId" placeholder="Task ID (e.g. task_1)" required style="padding:8px;">
                        <button type="submit" style="background:#2f80ed;">ইন্টারভিউ কনফার্ম ও বাজেট লক করুন</button>
                    </form>
                </div>
            </div>

            <!-- অ্যাডমিন প্যানেল -->
            <div class="card" style="background: #fff9db; border: 1px solid #f59f00;">
                <h2>৩. অ্যাডমিন প্যানেল (Web Admin Control)</h2>
                <p>ইউজার নির্দিষ্ট টাইমে কাজ জমা দেওয়ার পর এবং উভয় পক্ষ কনফার্ম করলে অ্যাডমিন প্যানেল থেকে পেমেন্ট রিলিজ হবে। এখানে কোম্পানি স্বয়ংক্রিয়ভাবে ফি কাটবে।</p>
                <form action="/api/admin/release-payment" method="POST" target="dummyframe">
                    <input type="text" name="taskId" placeholder="Task ID (e.g. task_1)" required style="padding:8px; margin-right:10px;">
                    <label><input type="checkbox" name="agencyConfirmation" value="true" checked> এজেন্সি কনফার্মেশন</label>
                    <label><input type="checkbox" name="userConfirmation" value="true" checked> ইউজার কনফার্মেশন</label>
                    <button type="submit" style="background:#9b51e0; margin-left:15px;">টাস্ক এন্ড করুন ও পেমেন্ট রিলিজ করুন</button>
                </form>
            </div>

            <br>
            <h2>৪. লাইভ ডাটাবেজ স্টেট (Live System State)</h2>
            <button onclick="fetchState()">ডাটা রিফ্রেশ করুন</button>
            <pre id="json-display">Loading system data...</pre>
        </div>

        <!-- ব্যাকগ্রাউন্ডে এপিআই সাবমিট করার জন্য ফ্রেম -->
        <iframe name="dummyframe" id="dummyframe" style="display:none;"></iframe>

        <script>
            function fetchState() {
                fetch('/api/dashboard')
                    .then(res => res.json())
                    .then(data => {
                        document.getElementById('json-display').textContent = JSON.stringify(data, null, 4);
                    });
            }
            // প্রতি ৩ সেকেন্ড পর পর ডাটা অটো রিফ্রেশ হবে
            setInterval(fetchState, 3000);
            window.onload = fetchState;
            
            document.getElementById('dummyframe').onload = function() {
                alert("অ্যাকশনটি সফলভাবে ব্যাকএন্ডে প্রসেস করা হয়েছে! নিচের লাইভ ডাটাবেজে আপডেট দেখুন।");
                fetchState();
            };
        </script>
    </body>
    </html>
    `);
});

app.listen(port, () => {
    console.log(`Company Job Platform running at http://localhost:${port}`);
});
