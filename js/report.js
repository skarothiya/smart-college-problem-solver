/**
 * Smart College Problem Solver - Report Problem Form Module
 * Handles form validation, image upload preview, and AI classifier auto-suggestions.
 */

class ReportFormManager {
    static async init() {
        const user = await AuthManager.requireStudentAuth();
        if (!user) return;

        const studentNameInput = document.getElementById('studentName');

        if (studentNameInput) {
            studentNameInput.value = user.name;
        }

        this.imageFile = null;
        this.lastAiSuggestion = null;
    }

    static onTextChange() {
        const title = document.getElementById('problemTitle')?.value || '';
        const desc = document.getElementById('problemDescription')?.value || '';

        if (!title.trim() && !desc.trim()) {
            this.updateAiBanner('Type title or description to generate auto-category & priority suggestions.', false);
            return;
        }

        // Run client-side classifier
        const result = ComplaintClassifier.analyze(title, desc);
        this.lastAiSuggestion = result;

        if (result && result.category !== 'Other') {
            const bannerText = `Suggested: <strong>${result.category}</strong> (${result.priority} Urgency)`;
            this.updateAiBanner(bannerText, true);

            // Auto-select in form
            const categorySelect = document.getElementById('problemCategory');
            const prioritySelect = document.getElementById('problemPriority');

            if (categorySelect && (!categorySelect.value || categorySelect.dataset.autoSet === 'true')) {
                categorySelect.value = result.category;
                categorySelect.dataset.autoSet = 'true';
            }

            if (prioritySelect && (prioritySelect.value === 'Medium' || prioritySelect.dataset.autoSet === 'true')) {
                prioritySelect.value = result.priority;
                prioritySelect.dataset.autoSet = 'true';
            }
        } else {
            this.updateAiBanner('Analyzing input...', false);
        }
    }

    static updateAiBanner(textHTML, showApplyBtn = false) {
        const textEl = document.getElementById('aiSuggestionText');
        const applyBtn = document.getElementById('applyAiBtn');

        if (textEl) textEl.innerHTML = textHTML;
        if (applyBtn) applyBtn.style.display = showApplyBtn ? 'inline-flex' : 'none';
    }

    static applyAiSuggestions() {
        if (!this.lastAiSuggestion) return;
        const categorySelect = document.getElementById('problemCategory');
        const prioritySelect = document.getElementById('problemPriority');

        if (categorySelect) categorySelect.value = this.lastAiSuggestion.category;
        if (prioritySelect) prioritySelect.value = this.lastAiSuggestion.priority;

        if (window.showToast) {
            window.showToast(`Applied AI suggestions: ${this.lastAiSuggestion.category} (${this.lastAiSuggestion.priority} Priority)`, 'success');
        }
    }

    static handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const validation = AppStorage.validateImageFile(file);
        if (!validation.ok) {
            if (window.showToast) window.showToast(validation.message, 'error');
            e.target.value = '';
            return;
        }

        this.imageFile = file;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const preview = document.getElementById('imagePreview');
            if (preview) {
                preview.src = evt.target.result;
                preview.style.display = 'block';
            }
            if (window.showToast) window.showToast('Photo evidence attached', 'success');
        };
        reader.readAsDataURL(file);
    }

    static async handleSubmit(e) {
        e.preventDefault();

        const studentName = document.getElementById('studentName').value.trim();
        const location = document.getElementById('problemLocation').value.trim();
        const title = document.getElementById('problemTitle').value.trim();
        const category = document.getElementById('problemCategory').value;
        const priority = document.getElementById('problemPriority').value;
        const description = document.getElementById('problemDescription').value.trim();

        if (!studentName || !location || !title || !category || !priority || !description) {
            if (window.showToast) window.showToast('Please fill in all required fields', 'error');
            return;
        }

        const problemData = {
            studentName,
            title,
            category,
            location,
            description,
            priority,
            imageFile: this.imageFile || null
        };

        const created = await AppStorage.addProblem(problemData);

        if (created) {
            if (window.showToast) {
                window.showToast('Problem report submitted successfully! Redirecting...', 'success');
            }

            setTimeout(() => {
                window.location.href = 'problems.html';
            }, 600);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    ReportFormManager.init();
});

window.ReportFormManager = ReportFormManager;
