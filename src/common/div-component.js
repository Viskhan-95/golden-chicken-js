export class DivComponent {
    constructor() {
        this.el = document.createElement('div'); // Создание элемента div
    }

    /**
     * Метод для получения элемента div.
     * @returns {HTMLElement} Элемент div.
     */
    getElement() {
        return this.el;
    }

    /**
     * Метод для добавления контента в элемент.
     * @param {string} content - HTML-код или текст для добавления.
     */
    setContent(content) {
        this.el.innerHTML = content; // Установка внутреннего HTML-кода
    }

    /**
     * Метод для добавления класса к элементу.
     * @param {string} className - Имя класса, который будет добавлен.
     */
    addClass(className) {
        this.el.classList.add(className); // Добавление класса
    }

    /**
     * Метод для рендеринга компонента. 
     * Переопределяется в дочерних классах, если требуется.
     */
    render() {
        return this.el; // Возвращает элемент div
    }
}
