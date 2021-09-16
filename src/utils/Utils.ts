export class Utils {
  static sleep(millis: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, millis));
  }

  static isNumeric(str: string): boolean {
    return /^[0-9]+$/.test(str);
  }
}
