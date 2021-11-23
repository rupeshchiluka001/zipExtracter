// This code is taken from the below url and made little changes.
// https://github.com/gildas-lormeau/zip.js/blob/gh-pages/demos/demo-read-file.js
let target1;
(() => {

	const INFLATE_IMPLEMENTATIONS = {
		"zip.js": ["lib/z-worker.js"],
		"fflate": ["lib/z-worker-fflate.js", "fflate.min.js"],
		"pako": ["lib/z-worker-pako.js", "pako_inflate.min.js"]
	};

	const model = (() => {

		return {
			getEntries(file, options) {
				return (new zip.ZipReader(new zip.BlobReader(file))).getEntries(options);
			},
			async getURL(entry, options) {
				return URL.createObjectURL(await entry.getData(new zip.BlobWriter(), options));
			}
		};

	})();

	(() => {

		const appContainer = document.getElementById("container");
		const fileInput = document.getElementById("file-input");
		const encodingInput = document.getElementById("encoding-input");
		const fileInputButton = document.getElementById("file-input-button");
		const passwordInput = document.getElementById("password-input");
		const inflateImplementationInput = document.getElementById("inflate-implementation-input");
		const fileListContainer = document.getElementById('file-list-container');
		const downloadButton = document.getElementById('downloadAll');
		const downloadAnchor = document.getElementById('downloadIndividual');
		let fileList = document.createElement('ul');
		fileList.id = 'file-list';
		fileListContainer.appendChild(fileList);;
		let entries, selectedFile;
		passwordInput.onchange = async () => fileList.querySelectorAll("a[download]").forEach(anchor => anchor.download = "");
		$.jstree.defaults.core.animation = 400;
		fileInput.onchange = selectFile;
		encodingInput.onchange = selectEncoding;
		inflateImplementationInput.onchange = selectInflateImplementation;
		appContainer.onclick = downloadFile;
		downloadButton.onclick = downloadAll;
		fileInputButton.onclick = () => fileInput.dispatchEvent(new MouseEvent("click"));
		selectInflateImplementation();

		async function downloadFile(event) {
			const target = event.target;
			let href = target.getAttribute("href");
			if (target.dataset.entryIndex !== undefined && !target.download && !href) {
				if (target.dataset.directory === 'true') {
					$('#file-list-container').jstree().toggle_node(target);
					return;
				}
				target.removeAttribute("href");
				event.preventDefault();
				try {
					await download(entries[Number(target.dataset.entryIndex)], target.parentElement.parentElement, target);
					href = target.getAttribute("href");
				} catch (error) {
					alert(error);
				}
				target.setAttribute("href", href);
			}
		}

		async function selectFile() {
			try {
				$('#file-list-container').show();
				$('#downloadAll').show();
				fileInputButton.disabled = true;
				encodingInput.disabled = true;
				selectedFile = fileInput.files[0];
				await loadFiles();
			} catch (error) {
				alert(error);
			} finally {
				fileInputButton.disabled = false;
				fileInput.value = "";
			}
		}

		async function selectEncoding() {
			try {
				encodingInput.disabled = true;
				fileInputButton.disabled = true;
				await loadFiles(encodingInput.value);
			} catch (error) {
				alert(error);
			} finally {
				fileInputButton.disabled = false;
			}
		}

		function selectInflateImplementation() {
			const inflateImplementation = INFLATE_IMPLEMENTATIONS[inflateImplementationInput.value];
			zip.configure({ workerScripts: { inflate: inflateImplementation } });
		}

		async function loadFiles(filenameEncoding) {
			entries = await model.getEntries(selectedFile, { filenameEncoding });
			if (entries && entries.length) {
				fileList.classList.remove("empty");
				const filenamesUTF8 = Boolean(!entries.find(entry => !entry.filenameUTF8));
				const encrypted = Boolean(entries.find(entry => entry.encrypted));
				encodingInput.value = filenamesUTF8 ? "utf-8" : filenameEncoding || "cp437";
				encodingInput.disabled = filenamesUTF8;
				passwordInput.value = "";
				passwordInput.disabled = !encrypted;
				refreshList();
			}
		}

		function refreshList() {
			if ($.jstree.reference($('#file-list-container'))) {
				$('#file-list-container').jstree('destroy');
				fileList = document.createElement('ul');
				fileList.id = 'file-list';
				fileListContainer.appendChild(fileList);
			}
			const newRootFileList = fileList.cloneNode();
			let newFileList = newRootFileList;
			entries.forEach((entry, entryIndex) => {
				const li = document.createElement("li");
				const filenameContainer = document.createElement("span");
				const filename = document.createElement("a");
				filenameContainer.classList.add("filename-container");
				li.appendChild(filenameContainer);
				filename.classList.add("filename");
				filename.dataset.entryIndex = entryIndex;
				filename.textContent = filename.title = entry.filename;
				filename.title = `${entry.filename}\n  Last modification date: ${entry.lastModDate.toLocaleString()}`;
				filenameContainer.appendChild(filename);
				newFileList.appendChild(li);
				if (entry.directory) {
					filename.dataset.directory = true;
					const ul = document.createElement("ul");
					li.appendChild(ul);
					newFileList = ul;
				}
				else {
					filename.dataset.directory = false;
					filename.href = "";
					filename.title += `\n  Uncompressed size: ${entry.uncompressedSize.toLocaleString()} bytes`;
				}
			});
			fileList.replaceWith(newRootFileList);
			fileList = newRootFileList;
			let treeView = $('#file-list-container');
			treeView.jstree();
			treeView.on("ready.jstree", function (e, data) {
				treeView.jstree('open_all');
			});
		}

		function downloadAll() {
			entries.forEach(async (entry) => {
				if ( !entry.directory ) {
					try {
						const blobURL = await model.getURL(entry, {
							password: passwordInput.value,
						});
						downloadAnchor.href = blobURL;
						downloadAnchor.download = entry.filename;
						downloadAnchor.dispatchEvent(new MouseEvent('click'));	
					} catch (error) {
						if (error.message != zip.ERR_ABORT) {
							throw error;
						}
					}
				}
			});
		}

		async function download(entry, li, a) {
			if (!li.classList.contains("busy")) {
				const unzipProgress = document.createElement("progress");
				li.appendChild(unzipProgress);
				const controller = new AbortController();
				const signal = controller.signal;
				const abortButton = document.createElement("button");
				abortButton.onclick = () => controller.abort();
				abortButton.textContent = "✖";
				abortButton.title = "Abort";
				li.querySelector(".filename-container").appendChild(abortButton);
				li.classList.add("busy");
				try {
					const blobURL = await model.getURL(entry, {
						password: passwordInput.value,
						onprogress: (index, max) => {
							unzipProgress.value = index;
							unzipProgress.max = max;
						},
						signal
					});
					a.href = blobURL;
					a.download = entry.filename;
					const clickEvent = new MouseEvent("click");
					a.dispatchEvent(clickEvent);
				} catch (error) {
					if (error.message != zip.ERR_ABORT) {
						throw error;
					}
				} finally {
					li.classList.remove("busy");
					unzipProgress.remove();
					abortButton.remove();
				}
			}
		}

	})();

})();