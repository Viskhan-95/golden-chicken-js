import { DivComponent } from "../../common/div-component";
import { categoriesDB } from "../../../static/DB/category.js";
import './category.css';

export class Category extends DivComponent {
    constructor(state) {
        super();
        this.state = state;
    }

    addOrRemoveClassActive(e) {
        if (e.target.classList.contains('active')) {
            return;
        }

        const navLinks = document.querySelectorAll('.nav-link');
        
        for (const navLink of navLinks) {
            navLink.classList.remove('active');
        }
        e.target.classList.add('active');
        this.state.category_id = Number(e.target.getAttribute('data-id'));
    }

    render() {
        const nav = document.createElement('nav');
        const ul = document.createElement('ul');

        for (const cat of categoriesDB) {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.innerHTML = cat.name;
            a.classList.add('nav-link', ...(cat._id === this.state.category_id ? ['active'] : []));
            a.setAttribute('data-id', cat._id);
            li.append(a);
            ul.append(li);
        }
        ul.addEventListener('click', this.addOrRemoveClassActive.bind(this));
        nav.append(ul);
        this.el.append(nav);
        return this.el;
    }
}
