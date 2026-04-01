// ==UserScript==
// @name            Order Review Hotkeys
// @namespace       http://tampermonkey.net/
// @version         1.12
// @description     Tab navigation (Strict Top Alignment), 'A' for Approve, 'D' for Deny (0), and 'M' for MOQ.
// @author          Justin Lin
// @match           https://admin.hourloop.com/*
// @require         https://code.jquery.com/jquery-3.6.0.min.js
// ==/UserScript==

(function () {
    'use strict';

    // ==========================================
    // ⚙️ [設定區] 頂部偏移量
    // 如果你們網頁最上方有「固定不動的導覽列」會擋住卡片，可以把 0 改成導覽列的高度 (例如 60 或 80)
    // 如果沒有，維持 0 就是最完美的「螢幕頂端 = 卡片頂端」
    // ==========================================
    const TOP_OFFSET = 60;

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
        const $denyBtn = activeContainer.find('span.fa-remove[title="Deny"]');
        if ($denyBtn.length > 0) {
            $denyBtn[0].click();
        }

        setTimeout(() => {
            const $input = activeContainer.find('input[name="order_review_item[suggested_qty]"]').first();

            if ($input.length) {
                const el = $input[0];

                el.focus();
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                if (nativeSetter) {
                    nativeSetter.call(el, targetValue);
                } else {
                    el.value = targetValue;
                }

                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));

                setTimeout(() => {
                    let $editor = activeContainer.nextAll().find('trix-editor').first();
                    if ($editor.length === 0) {
                        const threadId = activeContainer.find('[hx-get*="threads/"]').attr('hx-get')?.match(/\d+/)?.[0];
                        if (threadId) $editor = $(`#commontator-thread-${threadId}-new-comment-body-trix-editor`);
                    }

                    if ($editor.length > 0) {
                        const editorEl = $editor[0];
                        el.blur();
                        editorEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                        editorEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                        editorEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        editorEl.focus();
                    } else {
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

            // 【核心更新】絕對貼齊頂部滾動 (Strict Top Alignment)
            const elementTop = activeContainer[0].getBoundingClientRect().top + window.scrollY;
            window.scrollTo({
                top: elementTop - TOP_OFFSET,
                behavior: 'smooth'
            });

            // 視覺回饋：稍微閃爍一下背景色
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

            const $moqSpan = activeContainer.find('span[title="Minimum order quantity"]');
            let targetMoq = "0";

            if ($moqSpan.length > 0) {
                const match = $moqSpan.text().match(/\d+/);
                if (match) targetMoq = match[0];
            }

            fillQuantityAndTransferFocus(targetMoq);
        }
    });
})();
