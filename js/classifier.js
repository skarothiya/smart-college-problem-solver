/**
 * Smart College Problem Solver - Intelligent Complaint Classifier
 * Pure Vanilla JavaScript Client-Side Classifier Engine
 */

const CATEGORY_DICTIONARY = {
    'Wi-Fi / Network': ['wifi', 'internet', 'router', 'network', 'connection', 'vpn', 'signal', 'ethernet', 'no internet'],
    'Electrical': ['fan', 'light', 'electricity', 'ac', 'switch', 'power', 'bulb', 'socket', 'plug', 'generator'],
    'Water': ['water', 'tap', 'leakage', 'drinking', 'cooler', 'pipe', 'overflow', 'drain'],
    'Cleanliness': ['garbage', 'dirty', 'dust', 'cleaning', 'washroom', 'stink', 'litter', 'dustbin', 'sweeping'],
    'Classroom': ['bench', 'desk', 'board', 'classroom', 'chair', 'projector', 'blackboard', 'podium'],
    'Library': ['book', 'library', 'reading', 'journal', 'study', 'shelf', 'librarian'],
    'Computer / Lab': ['computer', 'pc', 'keyboard', 'mouse', 'printer', 'lab', 'monitor', 'cpu', 'software'],
    'Canteen': ['food', 'canteen', 'meal', 'hygiene', 'pos', 'scanner', 'snack', 'lunch'],
    'Transport': ['bus', 'driver', 'transport', 'route', 'shuttle', 'parking', 'pass']
};

const PRIORITY_DICTIONARY = {
    High: ['danger', 'emergency', 'broken', 'completely stopped', 'no internet', 'hazard', 'severe', 'fire', 'shock', 'leakage'],
    Medium: ['not working', 'problem', 'issue', 'slow', 'fluctuate', 'stuck', 'delay'],
    Low: ['minor', 'noise', 'small', 'suggestion', 'light dust', 'cosmetic', 'request']
};

/**
 * Classify Category from text content
 * @param {string} text - Title and description text
 * @returns {string} Suggested Category
 */
function classifyCategory(text = '') {
    if (!text || !text.trim()) return 'Other';
    const lowerText = text.toLowerCase();
    
    let bestCategory = 'Other';
    let maxScore = 0;

    for (const [category, keywords] of Object.entries(CATEGORY_DICTIONARY)) {
        let score = 0;
        keywords.forEach(kw => {
            if (lowerText.includes(kw)) {
                score += (kw.length > 4 ? 2 : 1); // Give slightly higher weight to multi-word or longer terms
            }
        });

        if (score > maxScore) {
            maxScore = score;
            bestCategory = category;
        }
    }

    return bestCategory;
}

/**
 * Classify Urgency Priority from text content
 * @param {string} text - Title and description text
 * @returns {string} Suggested Priority (Low, Medium, High)
 */
function classifyPriority(text = '') {
    if (!text || !text.trim()) return 'Medium';
    const lowerText = text.toLowerCase();

    // Check High Priority first
    for (const kw of PRIORITY_DICTIONARY.High) {
        if (lowerText.includes(kw)) return 'High';
    }

    // Check Low Priority
    for (const kw of PRIORITY_DICTIONARY.Low) {
        if (lowerText.includes(kw)) return 'Low';
    }

    // Default to Medium if "not working" or general issue terms are present
    return 'Medium';
}

/**
 * Modular Classifier Interface
 * Designed to be easy to swap with an external AI API call (e.g., fetch('/api/ai-classify'))
 */
class ComplaintClassifier {
    static classifyCategory(text) {
        return classifyCategory(text);
    }

    static classifyPriority(text) {
        return classifyPriority(text);
    }

    static analyze(title = '', description = '') {
        const fullText = `${title} ${description}`;
        const category = classifyCategory(fullText);
        const priority = classifyPriority(fullText);

        return {
            category: category,
            priority: priority,
            isAiSuggested: true,
            source: 'Client-Side Rule Engine'
        };
    }

    /**
     * Optional placeholder for future external AI API integration
     */
    static async classifyWithAI(title, description) {
        // Fallback to client-side heuristic engine
        return this.analyze(title, description);
    }

    /**
     * Test Classifier with 10 Hackathon Sample Complaints
     */
    static runTests() {
        const testCases = [
            { text: "Wi-Fi is not working in computer lab", expectedCat: "Wi-Fi / Network", expectedPri: "High" },
            { text: "Fan making noise in classroom", expectedCat: "Electrical", expectedPri: "Low" },
            { text: "Some dust on classroom desk", expectedCat: "Cleanliness", expectedPri: "Low" },
            { text: "Water leakage near library entrance", expectedCat: "Water", expectedPri: "High" },
            { text: "AC switch completely stopped working", expectedCat: "Electrical", expectedPri: "High" },
            { text: "Mouse and keyboard not working on PC 12 in lab", expectedCat: "Computer / Lab", expectedPri: "Medium" },
            { text: "Canteen meal food hygiene problem", expectedCat: "Canteen", expectedPri: "Medium" },
            { text: "Campus bus driver route delay issue", expectedCat: "Transport", expectedPri: "Medium" },
            { text: "Library book reading room light problem", expectedCat: "Library", expectedPri: "Medium" },
            { text: "Danger short circuit broken power socket in classroom", expectedCat: "Electrical", expectedPri: "High" }
        ];

        console.log("=== Running Intelligent Classifier Test Suite ===");
        let passed = 0;

        testCases.forEach((tc, idx) => {
            const cat = classifyCategory(tc.text);
            const pri = classifyPriority(tc.text);
            const catMatch = cat === tc.expectedCat;
            const priMatch = pri === tc.expectedPri;

            if (catMatch && priMatch) passed++;

            console.log(`Test #${idx + 1}: "${tc.text}"`);
            console.log(`  -> Output: Category [${cat}], Priority [${pri}] | Status: ${catMatch && priMatch ? 'PASSED ✅' : 'REVIEW ⚠️'}`);
        });

        console.log(`=== Test Results: ${passed} / ${testCases.length} Passed ===`);
        return passed;
    }
}

// Global exports
window.classifyCategory = classifyCategory;
window.classifyPriority = classifyPriority;
window.ComplaintClassifier = ComplaintClassifier;
