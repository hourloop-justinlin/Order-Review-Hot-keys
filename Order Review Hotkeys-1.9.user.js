// ==UserScript==
// @name            Order Review Hotkeys
// @namespace       http://tampermonkey.net/
// @version         1.9
// @description     Tab navigation, 'A' for Approve, 'D' for Deny (0), and 'M' for MOQ (Focus Transfer Method).
// @author          Justin Lin
// @match           https://admin.hourloop.com/*
// @require         https://code.jquery.com/jquery-3.6.0.min.js
// ==/UserScript==

(function () {
    'use strict';

    let activeContainer = null;
    let isKeyboardNavigating = false;
    let keyboardNavTimeout = null;

    function syncActiveCard($card) {
        $('.select-product-container, .order-item-row').removeClass('hl-active-card');
        if ($card && $card.length) {
            $card.addClass('hl-active-card');
        }
    }

    $(document).on('mouseenter', '.select-product-container, .order-item-row', function() {
        if (isKeyboardNavigating) return;
        activeContainer = $(this);
        syncActiveCard(activeContainer);
    });

    $(document).on('mouseleave', '.select-product-container, .order-item-row', function() {
        if (isKeyboardNavigating) return;
        if (activeContainer && activeContainer[0] === this) {
            activeContainer = null;
            syncActiveCard(null);
        }
    });

    // --- 核心共用功能：精準填值與焦點轉移 ---
    function fillQuantityAndTransferFocus(targetValue) {
        // 1. 點擊 Deny 展開欄位
        const $denyBtn = activeContainer.find('span.fa-remove[title="Deny"]');
        if ($denyBtn.length > 0) {
            $denyBtn[0].click();
        }

        // 2. 等待欄位展開後填值
        setTimeout(() => {
            const $input = activeContainer.find('input[name="order_review_item[suggested_qty]"]').first();

            if ($input.length) {
                const el = $input[0];

                // 強制破解框架寫入數值
                el.focus();
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                if (nativeSetter) {
                    nativeSetter.call(el, targetValue);
                } else {
                    el.value = targetValue;
                }

                // 發送打字事件
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));

                // 3. 延遲 100ms 後，尋找並模擬點擊 Trix 留言框
                setTimeout(() => {
                    let $editor = activeContainer.nextAll().find('trix-editor').first();
                    if ($editor.length === 0) {
                        const threadId = activeContainer.find('[hx-get*="threads/"]').attr('hx-get')?.match(/\d+/)?.[0];
                        if (threadId) $editor = $(`#commontator-thread-${threadId}-new-comment-body-trix-editor`);
                    }

                    if ($editor.length > 0) {
                        const editorEl = $editor[0];

                        // 讓輸入框失去焦點
                        el.blur();

                        // 模擬滑鼠在 Trix 編輯器上的完整點擊動作
                        editorEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                        editorEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                        editorEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

                        // 讓游標直接停在留言框裡
                        editorEl.focus();
                    } else {
                        // 備案：如果找不到留言框，就點擊網頁空白處
                        el.blur();
                        document.body.click();
                    }
                }, 100);
            }
        }, 800);
    }

    $(document).on('keydown', function(e) {
        const activeTag = (e.target.tagName || '').toLowerCase();
        const isEditable = e.target.isContentEditable || activeTag === 'trix-editor';
        if (activeTag === 'input' || activeTag === 'textarea' || isEditable) return;

        // --- Tab 與 Shift+Tab 導航切換產品 ---
        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();

            const $allContainers = $('.select-product-container, .order-item-row');
            if ($allContainers.length === 0) return;

            let nextIndex = 0;
            if (activeContainer) {
                const currentIndex = $allContainers.index(activeContainer);
                if (e.shiftKey) {
                    nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
                } else {
                    nextIndex = currentIndex < $allContainers.length - 1 ? currentIndex + 1 : currentIndex;
                }
            }

            activeContainer = $allContainers.eq(nextIndex);
            syncActiveCard(activeContainer);

            isKeyboardNavigating = true;
            clearTimeout(keyboardNavTimeout);
            keyboardNavTimeout = setTimeout(() => { isKeyboardNavigating = false; }, 600);

            activeContainer[0].scrollIntoView({ behavior: 'smooth', block: 'center' });

            const $target = activeContainer;
            const originalBg = $target.css('background-color');

            $target.css({'background-color': '#1f2937', 'transition': '0.2s'});
            setTimeout(() => {
                $target.css({'background-color': originalBg || '', 'transition': '0.5s'});
                setTimeout(() => $target.css('transition', ''), 500);
            }, 300);

            return;
        }

        if (!activeContainer) return;

        // --- A 鍵：一鍵 Approve ---
        if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'a' || e.key === 'A' || e.code === 'KeyA')) {
            e.preventDefault();
            e.stopPropagation();

            const $approveBtn = activeContainer.find('span[title="Approve"]');
            if ($approveBtn.length > 0) {
                const originalColor = $approveBtn.css('color');
                $approveBtn.css({'color': '#10b981', 'transform': 'scale(1.1)', 'transition': '0.1s'});
                setTimeout(() => {
                    $approveBtn.css({'color': originalColor, 'transform': 'scale(1)'});
                }, 300);

                $approveBtn[0].click();
            }
        }

        // --- D 鍵：點擊 Deny 填入 0 ---
        else if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) {
            e.preventDefault();
            e.stopPropagation();
            fillQuantityAndTransferFocus("0");
        }

        // --- M 鍵：動態抓取 MOQ 並填入 ---
        else if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'm' || e.key === 'M' || e.code === 'KeyM')) {
            e.preventDefault();
            e.stopPropagation();

            // 尋找 MOQ 的 span 標籤
            const $moqSpan = activeContainer.find('span[title="Minimum order quantity"]');
            let targetMoq = "0";

            if ($moqSpan.length > 0) {
                // 用 Regex 提取裡面的數字 (例如從 "MOQ: 6" 中提取 "6")
                const match = $moqSpan.text().match(/\d+/);
                if (match) {
                    targetMoq = match[0];
                }
            } else {
                console.warn("找不到 MOQ 數值，將預設帶入 0");
            }

            fillQuantityAndTransferFocus(targetMoq);
        }
    });
})();