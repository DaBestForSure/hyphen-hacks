function transformOrganizationsToComponentData(jsonData) {
    if (!jsonData || !Array.isArray(jsonData.organizations)) {
        console.error("Invalid input data: 'organizations' array is missing or not an array.");
        return [];
    }

    // A simple counter for generating unique componentIds
    let componentCounter = 1;

    return jsonData.organizations.map(org => {
        // Create the location string from city and state
        const location = `${org.city}, ${org.state}`;

        // The input data doesn't have a direct equivalent for 'subtext2' 
        // (e.g., "Mission", "Donation"). We'll use the 'ntee_code' as a placeholder,
        // or you could use a static string like "Nonprofit" or "Details".
        const subtext2Value = org.ntee_code || "N/A"; 

        return {
            // Generates a simple, unique ID (e.g., 'comp-1', 'comp-2')
            componentId: `comp-${componentCounter++}`, 
            // 'name' becomes 'title'
            title: org.name, 
            // 'city, state' becomes 'subtext1'
            subtext1: location, 
            // 'ntee_code' is used as 'subtext2'
            subtext2: subtext2Value 
        };
    });
}