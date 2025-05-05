import { auth, db } from "../firebase-config.js";
import { 
    collection, addDoc, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, orderBy, limit, startAfter, updateDoc 
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

// Firestore reference
const announcementsRef = collection(db, "announcements");

// DOM Elements
const announcementList = document.getElementById("announcement-list");
const postButton = document.getElementById("post-announcement");
const fileInput = document.getElementById("announcement-image");
const fileButton = document.getElementById("custom-file-button");
const fileNameDisplay = document.getElementById("file-name");
const imagePreview = document.getElementById("image-preview");
const announcementInput = document.getElementById("announcement-input");
const loadMoreButton = document.getElementById("load-more");


// Pagination variables
let lastVisible = null;
const PAGE_SIZE = 5; // Number of announcements to load per batch

//  Check if the logged-in user is the Captain
async function isCaptain(user) {
    if (!user) return false;
    const captainRef = doc(db, "config", "admin");
    const captainSnap = await getDoc(captainRef);
    return captainSnap.exists() && captainSnap.data().email === user.email;
}

//  Load announcements in batches
async function loadAnnouncements(initialLoad = true) {
    let queryConstraints = [orderBy("date", "desc"), limit(PAGE_SIZE)];

    if (!initialLoad && lastVisible) {
        queryConstraints.push(startAfter(lastVisible));
    }

    const querySnapshot = await getDocs(query(announcementsRef, ...queryConstraints));

    if (querySnapshot.empty) {
        console.log("No more announcements to load.");
        loadMoreButton.style.display = "none"; // Hide button if no more data
        return;
    }

    querySnapshot.forEach((doc) => displayAnnouncement(doc));

    //  Check if there's more data
    if (querySnapshot.docs.length < PAGE_SIZE) {
        loadMoreButton.style.display = "none"; // No more data to load
    } else {
        loadMoreButton.style.display = "block"; // Show button if more data exists
    }

    lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1]; // Update last document loaded
    assignDeleteButtons(); // Ensure delete buttons are assigned
}

// Function to create an announcement element
function displayAnnouncement(doc, prepend = false) {
    const announcement = doc.data();
    const li = document.createElement("li");
    li.setAttribute("id", `announcement-${doc.id}`);

    const textFormatted = announcement.text
        .replace(/</g, "&lt;")  
        .replace(/>/g, "&gt;")  
        .replace(/\n/g, "<br>") 
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>'); 

    let imagesHTML = "";
    if (announcement.images && Array.isArray(announcement.images)) {
        imagesHTML = `<div class="image-container">` + 
            announcement.images.map((image, index) => 
                `<img src="${image}" class="announcement-img" 
                      data-index="${index}" 
                      data-id="${doc.id}" 
                      onclick="openImageModal('${doc.id}', ${index})">`
            ).join("") + 
            `</div>`;
    }

    li.innerHTML = `
        <p class="announcement-text">${textFormatted}</p>
        ${imagesHTML}
        <small>(${new Date(announcement.date).toLocaleString().slice(0, -3)})</small>
        <button class="edit-btn" data-id="${doc.id}">Edit</button>
        <button class="delete-btn" data-id="${doc.id}" style="display: none;">Delete</button>
    `;

    if (prepend) {
        announcementList.prepend(li);
    } else {
        announcementList.appendChild(li);
    }

    li.querySelector(".edit-btn").addEventListener("click", () => openEditModal(doc.id, announcement));
}

// 📌 For the Image Modal (Viewing Images)
let imageList = []; // Updated name to avoid conflicts
let currentIndex = 0;

export function openImageModal(announcementId, index) {
    const images = document.querySelectorAll(`img[data-id="${announcementId}"]`);
    imageList = Array.from(images).map(img => img.src);
    currentIndex = index;

    document.getElementById("modal-image").src = imageList[currentIndex];
    document.getElementById("image-modal").style.display = "flex";
}

export function closeImageModal() {
    document.getElementById("image-modal").style.display = "none";
}

export function prevImage() {
    if (currentIndex > 0) {
        currentIndex--;
        document.getElementById("modal-image").src = imageList[currentIndex];
    }
}

export function nextImage() {
    if (currentIndex < imageList.length - 1) {
        currentIndex++;
        document.getElementById("modal-image").src = imageList[currentIndex];
    }
}

//  Assign Delete Buttons to All Announcements
function assignDeleteButtons() {
    document.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.style.display = "inline-block"; // Show delete button
        btn.removeEventListener("click", handleDelete); // Prevent duplicate listeners
        btn.addEventListener("click", handleDelete);
    });
}

//  Handle Delete Announcement
async function handleDelete(event) {
    const announcementId = event.target.dataset.id;
    if (!confirm("Are you sure you want to delete this announcement?")) return;

    try {
        await deleteDoc(doc(db, "announcements", announcementId));
        document.getElementById(`announcement-${announcementId}`).remove();
        alert("✅ Announcement deleted successfully!");
    } catch (error) {
        console.error("Error deleting announcement:", error);
        alert("❌ Failed to delete announcement.");
    }
}

//  Image Upload to ImgBB
async function uploadImages(files) {
    const apiKey = "fefe8e044819c8327dd6610fc3fe67a0"; // ImgBB API Key
    let uploadedUrls = [];

    for (const file of files) {
        try {
            const formData = new FormData();
            formData.append("image", file);

            const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
                method: "POST",
                body: formData
            });

            const result = await response.json();
            if (result.success) {
                uploadedUrls.push(result.data.url);
            }
        } catch (error) {
            console.error("Error uploading image:", error);
        }
    }

    return uploadedUrls;
}

//  Handle Authentication & Role-Based Access
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        console.warn(" No user logged in. Redirecting to login.");
        window.location.href = "../index.html";
        return;
    }

    const isUserCaptain = await isCaptain(user);

    if (!isUserCaptain) {
        console.warn(" Unauthorized access. Redirecting...");
        window.location.href = "../index.html";
        return;
    }

    console.log(" User verified as Captain.");

    // Show the announcement form only for captains
    document.getElementById("announcement-form-container").style.display = "block";

    // Assign delete buttons **after** checking user role
    assignDeleteButtons();
});

announcementInput.addEventListener("input", function () {
    this.style.height = "auto"; // Reset height
    this.style.height = this.scrollHeight + "px"; // Adjust to content
});

let selectedImages = []; // Stores all selected images

// Event Listener for File Selection
fileButton.addEventListener("click", () => {
    fileInput.value = ""; // Reset input to allow re-selection of the same file
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
        Array.from(fileInput.files).forEach((file) => {
            // Check if the file is already selected to prevent duplicates
            if (!selectedImages.some(img => img.name === file.name)) {
                selectedImages.push(file);
                displayImagePreview(file);
            }
        });
    }
    fileInput.value = ""; // Reset input so the same file can be re-selected
});

// Function to display image preview with a remove button
function displayImagePreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const imgContainer = document.createElement("div");
        imgContainer.classList.add("image-container");

        const img = document.createElement("img");
        img.src = e.target.result;
        img.classList.add("preview-image");

        const removeBtn = document.createElement("button");
        removeBtn.textContent = "❌";
        removeBtn.classList.add("remove-btn");

        removeBtn.addEventListener("click", () => {
            selectedImages = selectedImages.filter(img => img.name !== file.name); // Remove from array
            imgContainer.remove();
        });

        imgContainer.appendChild(img);
        imgContainer.appendChild(removeBtn);
        imagePreview.appendChild(imgContainer);
    };
    reader.readAsDataURL(file);
}

//  Updated Post Announcement Function
async function postAnnouncement() {
    const text = announcementInput.value.trim();

    if (!text) {
        alert("Please enter announcement text.");
        return;
    }

    postButton.disabled = true;
    postButton.innerText = "Posting...";

    let imageUrls = await uploadImages(selectedImages); // Use selectedImages array

    try {
        const docRef = await addDoc(announcementsRef, {
            text,
            images: imageUrls.length > 0 ? imageUrls : null,
            date: new Date().toISOString(),
        });

        const newAnnouncement = await getDoc(docRef);
        displayAnnouncement(newAnnouncement, true);
        assignDeleteButtons();
        alert("✅ Announcement posted successfully!");

        // Clear everything after posting
        announcementInput.value = "";
        selectedImages = []; // Reset selected images
        imagePreview.innerHTML = "";
    } catch (error) {
        console.error("Error posting announcement:", error);
        alert("❌ Failed to post announcement.");
    }

    postButton.disabled = false;
    postButton.innerText = "Post";
}

// Event Listeners for Posting & Load More
postButton.addEventListener("click", postAnnouncement);
loadMoreButton.addEventListener("click", () => loadAnnouncements(false));

//  Initial Load
loadAnnouncements();

const editModal = document.getElementById("edit-modal");
const editText = document.getElementById("edit-text");
const editImagePreview = document.getElementById("edit-image-preview");
const editImageInput = document.getElementById("edit-image-input");
const saveButton = document.getElementById("save-edit");
const closeModal = document.querySelector(".close-modal");

let currentEditId = null;
let currentImages = [];

// Open the Edit Modal
function openEditModal(docId, announcement) {
    currentEditId = docId;
    editText.value = announcement.text;
    currentImages = Array.isArray(announcement.images) ? [...announcement.images] : [];

    // Show existing images with a remove button
    editImagePreview.innerHTML = currentImages
        .map((image, index) => 
            `<div class="image-container">
                <img src="${image}" class="preview-img">
                <button class="remove-img" data-index="${index}">✖</button>
            </div>`
        ).join("");

    editModal.style.display = "block";

    // Remove an image
    document.querySelectorAll(".remove-img").forEach(button => {
        button.addEventListener("click", function () {
            const index = this.getAttribute("data-index");
            currentImages.splice(index, 1);
            openEditModal(docId, { text: editText.value, images: currentImages });
        });
    });
}

// Close the modal
closeModal.addEventListener("click", () => {
    editModal.style.display = "none";
});

// Handle image uploads
editImageInput.addEventListener("change", function () {
    const files = Array.from(editImageInput.files);
    const fileReaders = files.map(file => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    });

    Promise.all(fileReaders).then(images => {
        currentImages = currentImages.concat(images);
        openEditModal(currentEditId, { text: editText.value, images: currentImages });
    });
});

// Save the edited announcement
saveButton.addEventListener("click", async () => {
    const newText = editText.value.trim();

    // Separate new files from already uploaded images
    const newFiles = Array.from(editImageInput.files);
    const alreadyUploadedImages = currentImages.filter(img => img.startsWith("http")); // Keep already uploaded URLs

    try {
        let newImageUrls = [];

        // Upload new images to ImgBB if there are new files
        if (newFiles.length > 0) {
            newImageUrls = await uploadImages(newFiles);
        }

        // Combine old images and new images
        const updatedImages = [...alreadyUploadedImages, ...newImageUrls];

        // Save to Firestore
        await updateDoc(doc(db, "announcements", currentEditId), {
            text: newText,
            images: updatedImages.length > 0 ? updatedImages : null,
        });

        alert("✅ Announcement updated successfully!");
        editModal.style.display = "none";
        location.reload();
    } catch (error) {
        console.error("Error updating announcement:", error);
        alert("❌ Failed to update announcement.");
    }
});

