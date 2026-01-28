import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';


import { DiagnosticCode, SystemGrouping } from '../../models/rating.model';
import { RatingDataService } from '../../services/rating-data.service';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {

    ratings: DiagnosticCode[] = [];
    filteredRatings: DiagnosticCode[] = [];

    systemGroupings: SystemGrouping[] = [];
    availableSubSystems: string[] = [];

    // Filters
    searchCode: string = '';
    searchCondition: string = ''; // Body Part / Condition

    selectedSystem: string = '';
    selectedSubSystem: string = '';

    // Theme state
    currentTheme: string = 'Night Ops';



    constructor(
        private ratingService: RatingDataService,
        @Inject(DOCUMENT) private document: Document
    ) { }

    ngOnInit(): void {
        console.log('Dashboard Initializing...');
        // Load initial data
        this.ratingService.getRatings().subscribe({
            next: (data) => {
                console.log(`Ratings Loaded: ${data.length} items.`);
                this.ratings = data;
                // Initialize filteredRatings immediately to avoid empty state race
                this.filteredRatings = data;
                this.clearFilters();
                console.log(`Filtered Ratings set to: ${this.filteredRatings.length} items.`);
            },
            error: (err) => {
                console.error('Error loading ratings:', err);
            }
        });

        // Load groupings
        this.ratingService.getSystemGroupings().subscribe(groupings => {
            this.systemGroupings = groupings;
            console.log('System Groupings Loaded:', groupings.length);
        });

        setTimeout(() => {
            this.clearFilters();
        }, 5);
    }

    onSystemChange(): void {
        this.selectedSubSystem = '';
        if (this.selectedSystem) {
            const group = this.systemGroupings.find(g => g.name === this.selectedSystem);
            this.availableSubSystems = group ? group.subSystems : [];
        } else {
            this.availableSubSystems = [];
        }
        this.applyFilter();
    }

    applyFilter(): void {
        console.log('Applying Filter...');
        console.log(`State -> Code: '${this.searchCode}', Condition: '${this.searchCondition}', System: '${this.selectedSystem}', Sub: '${this.selectedSubSystem}'`);

        // Safety check
        if (!this.ratings) {
            console.warn('Ratings data is null/undefined in applyFilter');
            this.filteredRatings = [];
            return;
        }

        let temp = [...this.ratings]; // Create shallow copy

        // Filter by Diagnostic Code
        if (this.searchCode && this.searchCode.trim() !== '') {
            const codeTerm = this.searchCode.toLowerCase().trim();
            temp = temp.filter(r => r.code.toLowerCase().includes(codeTerm));
        }

        // Filter by Body Part / Condition
        if (this.searchCondition && this.searchCondition.trim() !== '') {
            const term = this.searchCondition.toLowerCase().trim();
            temp = temp.filter(r =>
                r.condition.toLowerCase().includes(term) ||
                r.system.toLowerCase().includes(term) ||
                (r.subSystem && r.subSystem.toLowerCase().includes(term))
            );
        }

        // Keep System filters as optional secondary filters
        if (this.selectedSystem && this.selectedSystem.trim() !== '') {
            temp = temp.filter(r => r.system === this.selectedSystem);
        }

        if (this.selectedSubSystem && this.selectedSubSystem.trim() !== '') {
            temp = temp.filter(r => r.subSystem === this.selectedSubSystem);
        }

        this.filteredRatings = temp;
        console.log(`Filter Result: ${this.filteredRatings.length} items found.`);
    }

    clearFilters(): void {
        this.searchCode = '';
        this.searchCondition = '';
        this.selectedSystem = '';
        this.selectedSubSystem = '';
        this.onSystemChange(); // Resets subsystems
        this.applyFilter();
    }

    setTheme(themeName: string, themeId: string) {
        this.currentTheme = themeName;
        if (themeId === 'default') {
            this.document.documentElement.removeAttribute('data-theme');
        } else {
            this.document.documentElement.setAttribute('data-theme', themeId);
        }
    }

    getFragmentLink(link: string, code: string): string {
        // Append Text Fragment for auto-highlighting in new tab
        // Syntax: #:~:text=code
        return `${link}#:~:text=${code}`;
    }
}
