export class ApiResponse<T> {
  public success: boolean;
  public data: T | null;
  public message: string;
  public timestamp: string;

  constructor(data: T | null, message = 'Success') {
    this.success = true;
    this.data = data;
    this.message = message;
    this.timestamp = new Date().toISOString();
  }
}
