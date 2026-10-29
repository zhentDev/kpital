import toast from "react-hot-toast";

/**
 * Standard Dialog Confirmation that appears cleanly in front of any modal
 * without being hidden behind backdrops or requiring closing the modal.
 */
export const toastConfirm = (message) => {
  return Promise.resolve(window.confirm(message));
};

/**
 * Standard Prompt Dialog that appears cleanly in front of any modal.
 */
export const toastPrompt = (message, defaultValue = "") => {
  return Promise.resolve(window.prompt(message, defaultValue));
};
