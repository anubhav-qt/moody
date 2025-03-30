import fs from 'fs';
import path from 'path';

class FileExportService {
  /**
   * Save data to a JSON file
   * @param data Data to save
   * @param filename Name of the file (without extension)
   * @param directory Directory to save the file in (relative to project root)
   * @returns Path to the saved file
   */
  async saveToJsonFile(
    data: any, 
    filename: string,
    directory: string = 'data'
  ): Promise<string> {
    try {
      // Ensure the directory exists
      const dirPath = path.join(process.cwd(), directory);
      
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
      }
      
      // Generate the full file path
      const fullPath = path.join(dirPath, `${filename}.json`);
      
      // Convert data to JSON and write to file
      const jsonData = JSON.stringify(data, null, 2);
      fs.writeFileSync(fullPath, jsonData);
      
      console.log(`Successfully saved data to ${fullPath}`);
      return fullPath;
    } catch (error) {
      console.error('Error saving data to JSON file:', error);
      throw error;
    }
  }
}

export default new FileExportService();
